/**
 * Counter Session
 * The counting experience itself: zikr header, tap circle, reset, and the
 * round flow (auto-save at the target → Another Round / Done). Pure with
 * respect to callers: every use passes its own `startCount` and `target`,
 * and receives `onCount` for each count change to act on it.
 *
 * progressMode disambiguates what startCount means:
 * - 'personal' (default): startCount is the user's own unsaved progress
 *   (mirrored unsaved round or the durable zikrLastCount checkpoint). The
 *   session auto-saves that progress as it counts, and the whole displayed
 *   count is unsaved, so saves carry it in full.
 * - 'room': startCount is the room's already-saved total. Only THIS
 *   session's taps are ever saved/contributed, and nothing checkpoints.
 *
 * Counting NEVER stops at the target: the board keeps going (1001, 1002,
 * …) and each full target's worth of unsaved counts auto-saves as its own
 * round — the surplus past a target is persisted like any other count.
 * Whatever is still unsaved when the user leaves rides on the durable
 * checkpoint (personal) or the caller's mirror (room).
 *
 * The board bookkeeping: `count` is the displayed number; `savedSoFar` is
 * how much of the counting since open has already been persisted. What can
 * still be saved is count − saveableBase − savedSoFar, where saveableBase
 * is the portion already on the books before the session opened (0 for
 * personal, the room total for rooms).
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
   * caller-relevant count: personal surfaces receive the UNSAVED count
   * (what a resume should start from), room surfaces the board total.
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

  // See the header comment for the board model.
  const [count, setCount] = useState(startCount);
  const [savedSoFar, setSavedSoFar] = useState(0);
  // Round flow: the first successful auto-save swaps the action area to
  // "Continue next / Done / Another Round" — counting keeps going behind it.
  const [isRoundSaved, setIsRoundSaved] = useState(false);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  // Sync mirror of isRoundSaved: guards that read it synchronously.
  const isRoundSavedRef = useRef(false);

  // Haptics come straight from settings so a toggle anywhere applies live.
  const hapticsEnabled = useSettingsStore(state => state.settings.hapticsEnabled ?? true);
  const { trigger: haptic, isSupported: hapticsSupported } = useHaptic(hapticsEnabled);

  const zikrDisplayInfo = getZikrDisplayInfoFromZikr(zikr, lang);
  const isRoomContinuation = progressMode === 'room';
  // The portion of the board that was already persisted before this
  // session opened: nothing for a personal round, the room's total for a
  // room continuation.
  const saveableBase = isRoomContinuation ? startCount : 0;
  // What a save would persist right now — the board's unsaved remainder.
  const saveAmount = Math.max(0, count - saveableBase - savedSoFar);
  // A room opened past its target never auto-saves (Finish & Save does);
  // personal rounds always do.
  const canAutoSave = startCount < target;

  // Durable auto-save of an in-progress personal round: countRecorder
  // debounces the write per zikr, so a burst of taps is one IndexedDB put.
  // It tracks the UNSAVED count only — the part a resume should pick up.
  useEffect(() => {
    if (progressMode !== 'personal') return;
    void checkpointProgress(zikr.id!, saveAmount);
  }, [progressMode, saveAmount, zikr.id, checkpointProgress]);

  const handleIncrement = () => {
    // No target gate on purpose: reaching the target saves a round, and
    // counting flows straight on — every tap is real dhikr.
    setCount(count + 1);
    onCount(isRoomContinuation ? count + 1 : saveAmount + 1);
  };

  const handleReset = () => {
    // Discard the unsaved remainder; what is already persisted stays.
    setCount(saveableBase + savedSoFar);
    onCount(isRoomContinuation ? saveableBase + savedSoFar : 0);
    haptic('light');
  };

  // Persist what this session added — the business rules (edit window,
  // counts-toward-goals default, room propagation) live in the store's
  // recordCount/countRecorder, not here.
  const persistCount = (countToSave: number) =>
    recordCount({ zikrId: zikr.id!, zikrName: zikr.name, count: countToSave });

  // Post-save bookkeeping for a personal round: the durable checkpoint is
  // consumed by the save and re-rides on the remaining unsaved count.
  const afterPersonalSave = () => {
    clearCurrentSession();
    void clearProgressCheckpoint(zikr.id!);
  };

  // Each full target's worth of unsaved counts saves itself — no button
  // needed. Saving never pauses the board: savedSoFar advances, the user
  // keeps tapping, and the next segment saves at its own multiple.
  useEffect(() => {
    if (
      saveAmount > 0 &&
      canAutoSave &&
      saveAmount >= target &&
      !isAutoSaving
    ) {
      const autoSave = async () => {
        setIsAutoSaving(true);
        try {
          await persistCount(saveAmount);
          setSavedSoFar(savedSoFar => savedSoFar + saveAmount);
          if (progressMode === 'personal') afterPersonalSave();
          isRoundSavedRef.current = true;
          setIsRoundSaved(true);
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
  }, [saveAmount, target, canAutoSave, isAutoSaving]);

  const handleAnotherRound = () => {
    setCount(saveableBase);
    setSavedSoFar(0);
    isRoundSavedRef.current = false;
    setIsRoundSaved(false);
    onCount(isRoomContinuation ? saveableBase : 0);
    haptic('light');
  };

  const handleComplete = async () => {
    if (saveAmount === 0) return;

    try {
      await persistCount(saveAmount);
      setSavedSoFar(savedSoFar => savedSoFar + saveAmount);
      if (progressMode === 'personal') afterPersonalSave();
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
        count={count}
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
