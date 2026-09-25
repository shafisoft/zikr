/**
 * Counter Session
 * The counting experience itself: zikr header, tap circle, reset, and the
 * round flow (auto-save at target → Another Round / Done). Pure with
 * respect to callers: every use passes its own `startCount` and `target`,
 * and receives `onCount` for each count change to act on it.
 *
 * progressMode disambiguates what startCount means:
 * - 'personal' (default): startCount is the user's own unsaved progress
 *   (mirrored unsaved round or the durable zikrLastCount checkpoint). The
 *   session auto-saves that progress as it counts, saves the whole
 *   displayed count at the target, and clears the durable checkpoint.
 * - 'room': startCount is the room's already-saved total. Only THIS
 *   session's taps are ever saved/contributed, and nothing checkpoints.
 *
 * Saving always records what THIS session added:
 * - room continuation: only the new taps are saved — never the base count.
 * - personal round: the whole displayed count is unsaved, so it is saved
 *   in full; afterwards a new round starts from zero.
 */

import React, { useState, useEffect, useRef } from 'react';
import CounterCircle from '../CounterCircle';
import MaterialIcon from '../MaterialIcon';
import OrnamentDivider from '../decor/OrnamentDivider';
import PatternBackdrop from '../decor/PatternBackdrop';
import useHaptic from '../../hooks/useHaptic';
import { useI18n } from '../../../core/i18n';
import { useSessionStore } from '../../../core/stores/sessionStore';
import { useSettingsStore } from '../../../core/stores/settingsStore';
import { getZikrDisplayInfoFromZikr } from '../../utils/zikrMapping';
import { Zikr } from '../../../core/db/types';

interface CounterSessionProps {
  zikr: Zikr;
  /** Count already on the board when the session opens. Always required. */
  startCount: number;
  /** Round target. Always required — the caller owns what the target is. */
  target: number;
  /**
   * What startCount represents — see the header comment. Defaults to
   * 'personal'; the room modal passes 'room'.
   */
  progressMode?: 'personal' | 'room';
  /**
   * Called on every count change (each tap, reset, another round) with the
   * displayed count, so the caller can react to it.
   */
  onCount: (count: number) => void;
  /**
   * Called when the user finishes explicitly — "Done" after an auto-saved
   * round, or "Finish & Save" — with the count that was persisted. A save
   * failure never reaches onFinish.
   */
  onFinish: (savedCount: number) => void;
  /**
   * Present when another zikr follows in the plan the counter was opened
   * from — after a saved round, offers jumping straight to it.
   */
  onContinueNext?: () => void;
  /**
   * 'page' pins the action area to the viewport bottom (full-screen use);
   * 'modal' keeps it inline at the end of the content (dialog use).
   */
  variant?: 'page' | 'modal';
  /** In a dialog, Escape belongs to closing — only the page binds it to reset. */
  escapeResets?: boolean;
}

const CounterSession: React.FC<CounterSessionProps> = ({
  zikr,
  startCount,
  target,
  progressMode = 'personal',
  onCount,
  onFinish,
  onContinueNext,
  variant = 'page',
  escapeResets = true,
}) => {
  const { lang, t } = useI18n();
  const clearCurrentSession = useSessionStore(state => state.clearCurrentSession);
  const clearProgressCheckpoint = useSessionStore(state => state.clearProgressCheckpoint);
  const checkpointProgress = useSessionStore(state => state.checkpointProgress);
  const recordCount = useSessionStore(state => state.recordCount);

  // What the board started from, and taps added in THIS session. A saved
  // personal round consumed its base (it persisted with the round), so the
  // base drops to zero then — "Another Round" starts from zero, not from
  // an already-saved count. A room base stays: it lives on the room's books.
  const [base, setBase] = useState(startCount);
  const [taps, setTaps] = useState(0);
  // Round flow: when the target is hit, the round saves itself and the UI
  // switches to "Another Round / Done" instead of the manual save button.
  const [isRoundSaved, setIsRoundSaved] = useState(false);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  // The completed round keeps its number on the board while base/taps reset
  // underneath it; null while counting.
  const [savedDisplay, setSavedDisplay] = useState<number | null>(null);
  const autoSaveTriggeredRef = useRef(false);
  // Sync mirror of isRoundSaved: guards that read it synchronously.
  const isRoundSavedRef = useRef(false);

  // Haptics come straight from settings so a toggle anywhere applies live.
  const hapticsEnabled = useSettingsStore(state => state.settings.hapticsEnabled ?? true);
  const { trigger: haptic, isSupported: hapticsSupported } = useHaptic(hapticsEnabled);

  const zikrDisplayInfo = getZikrDisplayInfoFromZikr(zikr, lang);
  const liveCount = base + taps;
  const displayCount = isRoundSaved && savedDisplay !== null ? savedDisplay : liveCount;
  const isRoomContinuation = progressMode === 'room';
  // What completing a round persists: a room continuation only ever
  // contributes its own taps; a personal round's whole display is unsaved
  // taps.
  const saveAmount = isRoomContinuation ? taps : displayCount;
  // A continuation auto-saves only while its target is still open; past the
  // target, "Finish & Save" records the taps instead.
  const canAutoSave = startCount < target;

  // Durable auto-save of an in-progress personal round: countRecorder
  // debounces the write per zikr, so a burst of taps is one IndexedDB put.
  // Guarded on the sync ref — a completed round must not re-checkpoint its
  // just-saved count after the base resets.
  useEffect(() => {
    if (progressMode !== 'personal' || isRoundSavedRef.current) return;
    void checkpointProgress(zikr.id!, liveCount);
  }, [progressMode, liveCount, zikr.id, checkpointProgress]);

  const handleIncrement = () => {
    // Personal rounds stop at the target (the round completes there);
    // a continuation keeps counting — every tap is real dhikr.
    if (isRoomContinuation || liveCount < target) {
      setTaps(taps + 1);
      onCount(liveCount + 1);
    }
  };

  const handleReset = () => {
    setTaps(0);
    setIsRoundSaved(false);
    isRoundSavedRef.current = false;
    autoSaveTriggeredRef.current = false;
    onCount(base);
    haptic('light');
  };

  // Persist what this session added — the business rules (edit window,
  // counts-toward-goals default, room propagation) live in the store's
  // recordCount/countRecorder, not here.
  const persistCount = (countToSave: number) =>
    recordCount({ zikrId: zikr.id!, zikrName: zikr.name, count: countToSave });

  // Post-save bookkeeping for a personal round: the mirror and the durable
  // checkpoint are consumed by the save, and the board freezes on the saved
  // number while a fresh round starts from zero underneath.
  const finishPersonalRound = (savedAmount: number) => {
    clearCurrentSession();
    void clearProgressCheckpoint(zikr.id!);
    setBase(0);
    setSavedDisplay(savedAmount);
  };

  // When the target is hit the round saves itself — no save button needed.
  // autoSaveTriggeredRef keeps this to one attempt per round (manual
  // "Finish & Save" remains the fallback if the save fails).
  useEffect(() => {
    if (
      saveAmount > 0 &&
      canAutoSave &&
      displayCount >= target &&
      !isRoundSaved &&
      !isAutoSaving &&
      !autoSaveTriggeredRef.current
    ) {
      const autoSave = async () => {
        autoSaveTriggeredRef.current = true;
        setIsAutoSaving(true);
        try {
          await persistCount(saveAmount);
          isRoundSavedRef.current = true;
          setIsRoundSaved(true);
          if (progressMode === 'personal') finishPersonalRound(saveAmount);
          haptic('success');
        } catch (error) {
          console.error('Failed to auto-save round:', error);
          haptic('warning');
        } finally {
          setIsAutoSaving(false);
        }
      };
      void autoSave();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saveAmount, displayCount, target, canAutoSave, isRoundSaved, isAutoSaving]);

  const handleAnotherRound = () => {
    isRoundSavedRef.current = false;
    setIsRoundSaved(false);
    setSavedDisplay(null);
    autoSaveTriggeredRef.current = false;
    setTaps(0);
    onCount(isRoomContinuation ? base : 0);
    haptic('light');
  };

  const handleComplete = async () => {
    if (saveAmount === 0) return;

    try {
      await persistCount(saveAmount);
      if (progressMode === 'personal') finishPersonalRound(saveAmount);
      haptic('success');
      onFinish(saveAmount);
    } catch (error) {
      console.error('Failed to save session:', error);
      haptic('warning');
    }
  };

  // Keyboard: Space/Enter to count; Escape resets (page only — a dialog
  // binds Escape to closing instead).
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
        e.preventDefault();
        handleIncrement();
        haptic('light');
      }
      if (e.key === 'Escape' && escapeResets && saveAmount > 0 && !isRoundSaved) {
        const confirmed = confirm(t('counter.resetConfirm'));
        if (confirmed) {
          handleReset();
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleIncrement, saveAmount, haptic, escapeResets, isRoundSaved]);

  return (
    <div className={`relative flex-1 flex flex-col ${variant === 'page' ? 'overflow-hidden items-center justify-center pb-32' : 'items-center justify-center'}`}>
      {/* Khatam pattern backdrop */}
      <PatternBackdrop className="absolute inset-0" />

      {/* Zikr Info */}
      <div className="text-center mb-12 z-10 flex flex-col gap-4">
        {zikrDisplayInfo.arabicText && (
          <h1 className="font-display-arabic text-display-arabic text-primary" lang="ar" dir="rtl">
            {zikrDisplayInfo.arabicText}
          </h1>
        )}
        <OrnamentDivider className="w-44 mx-auto" />
        <p className="font-body-lg text-body-lg text-on-surface-variant">
          {zikrDisplayInfo.translation}
        </p>
      </div>

      {/* Counter Circle */}
      <CounterCircle
        count={displayCount}
        target={target}
        onIncrement={handleIncrement}
        hapticsEnabled={hapticsEnabled}
      />

      {/* Reset Button — hidden once the round is saved */}
      {!isRoundSaved && (
        <button
          onClick={handleReset}
          className="mt-8 text-on-surface-variant flex items-center gap-2 px-4 py-2 rounded-full hover:bg-surface-variant/50 transition-colors z-10 font-caption text-caption active-scale-95"
        >
          <MaterialIcon icon="refresh" className="text-[18px]" />
          {t('counter.reset')}
        </button>
      )}

      {/* Haptics silently no-op on browsers without the Vibration API
          (all iOS browsers) — say so instead of leaving a dead toggle. */}
      {!hapticsSupported && hapticsEnabled && (
        <p className="mt-3 text-center font-caption text-caption text-on-surface-variant/60 z-10 px-6">
          {t('counter.hapticsUnsupported')}
        </p>
      )}

      {/* Action area */}
      {variant === 'page' ? (
        <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md p-container-padding-mobile pb-[calc(env(safe-area-inset-bottom)+24px)] bg-gradient-to-t from-surface via-surface/90 to-transparent z-40">
          <RoundActions
            isRoundSaved={isRoundSaved}
            canSave={saveAmount > 0}
            savedCount={saveAmount}
            onAnotherRound={handleAnotherRound}
            onFinish={onFinish}
            onComplete={handleComplete}
            onContinueNext={onContinueNext}
          />
        </div>
      ) : (
        <div className="w-full mt-8 z-10">
          <RoundActions
            isRoundSaved={isRoundSaved}
            canSave={saveAmount > 0}
            savedCount={saveAmount}
            onAnotherRound={handleAnotherRound}
            onFinish={onFinish}
            onComplete={handleComplete}
            onContinueNext={onContinueNext}
          />
        </div>
      )}
    </div>
  );
};

/** Round flow actions: saved → (Continue next) Another Round / Done; counting → Finish & Save. */
const RoundActions: React.FC<{
  isRoundSaved: boolean;
  canSave: boolean;
  savedCount: number;
  onAnotherRound: () => void;
  onFinish: (savedCount: number) => void;
  onComplete: () => void;
  onContinueNext?: () => void;
}> = ({ isRoundSaved, canSave, savedCount, onAnotherRound, onFinish, onComplete, onContinueNext }) => {
  const { t } = useI18n();

  if (isRoundSaved) {
    return (
      <div className="w-full flex flex-col items-center gap-3">
        {/* Saved confirmation */}
        <div className="flex items-center gap-2 text-tertiary font-label-md text-label-md">
          <MaterialIcon icon="check_circle" filled className="text-[20px]" />
          <span>{t('counter.roundSaved')}</span>
        </div>
        {/* The plan's next zikr is the suggested path, so it takes the
            primary slot and demotes Another Round to a secondary action. */}
        {onContinueNext && (
          <button
            onClick={onContinueNext}
            className="
              w-full h-touch-target-min
              bg-primary-container text-on-primary
              rounded-xl font-label-md text-label-md
              flex items-center justify-center gap-2
              hover:opacity-90 active:scale-[0.98] transition-all shadow-sm
            "
          >
            <MaterialIcon icon="skip_next" className="text-[20px]" />
            {t('counter.continueNext')}
          </button>
        )}
        <div className="w-full flex gap-3">
          <button
            onClick={() => onFinish(savedCount)}
            className="
              flex-1 h-touch-target-min
              rounded-xl border border-outline-variant/40 text-on-surface
              font-label-md text-label-md
              flex items-center justify-center gap-2
              hover:bg-surface-variant/40 active:scale-[0.98] transition-all
            "
          >
            <MaterialIcon icon="home" className="text-[18px]" />
            {t('counter.done')}
          </button>
          <button
            onClick={onAnotherRound}
            className={`
              flex-1 h-touch-target-min rounded-xl font-label-md text-label-md
              flex items-center justify-center gap-2
              active:scale-[0.98] transition-all
              ${
                onContinueNext
                  ? 'border border-outline-variant/40 text-on-surface hover:bg-surface-variant/40'
                  : 'bg-primary-container text-on-primary hover:opacity-90 shadow-sm'
              }
            `}
          >
            <MaterialIcon icon="replay" className="text-[18px]" />
            {t('counter.anotherRound')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={onComplete}
      disabled={!canSave}
      className="
        w-full h-touch-target-min
        bg-primary-container text-on-primary
        rounded-xl font-label-md text-label-md
        flex items-center justify-center gap-2
        hover:opacity-90 active-scale-98 transition-all shadow-sm
        disabled:opacity-50 disabled:cursor-not-allowed
      "
    >
      <MaterialIcon icon="check_circle" className="text-[20px]" />
      {t('counter.complete', { count: savedCount })}
    </button>
  );
};

export default CounterSession;
