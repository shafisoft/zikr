/**
 * RoutinesSectionContainer — the Home routines section (R2, §16.3). The one
 * data-touching tier for the surface: it subscribes to the routine/session/
 * zikr/settings stores, derives the day-context groups via routineSections
 * (§2.3) and each row's today-state via routineUtils, and invokes store
 * actions (createPreset, softDelete, saveSetting('routinePresetOffer')).
 * Presentational rows get props in and bubble callbacks out; the page
 * decides navigation (deep-link to the counter flow) and when the editor
 * dialog opens.
 *
 * Context grouping (the day-aware redesign): rows render under NOW (window
 * open, not done), UP NEXT (the nearest upcoming window, time-labelled),
 * DONE TODAY, and ANYTIME (custom routines). A weekday-bound routine
 * (friday) appears only on its weekday. Micro-labels render only when at
 * least two groups are visible — a single group needs no scaffolding.
 *
 * With no routines: at most one quiet dismissible preset offer (AC2.4.2) —
 * dismissal persists via the `routinePresetOffer` settings KV; no nag
 * (AC2.4.3). Once dismissed (or nothing to offer) the container renders
 * nothing — the default app is unchanged (P1).
 */

import React, { useCallback, useEffect, useMemo } from 'react';
import MaterialIcon from '../../components/MaterialIcon';
import RoutineRow from '../../components/routines/RoutineRow';
import QuietPresetOfferRow from '../../components/routines/QuietPresetOfferRow';
import { showConfirm } from '../../components/ConfirmDialog';
import { useRoutineStore } from '../../../core/stores/routineStore';
import { useSessionStore } from '../../../core/stores/sessionStore';
import { useZikrStore } from '../../../core/stores/zikrStore';
import { useSettingsStore } from '../../../core/stores/settingsStore';
import { useI18n } from '../../../core/i18n';
import useNow from '../../hooks/useNow';
import { formatDate, formatTime, getToday } from '../../../core/utils/dateUtils';
import {
  hasPresetClusterZikr,
  RoutinePresetKey,
  routineSections,
  routineStreakStatus,
  routineTodayState,
} from '../../../core/utils/routineUtils';
import type { Routine } from '../../../core/db/types';

/** Shape of the `routinePresetOffer` settings KV row (§5.3). */
export interface RoutinePresetOfferSetting {
  dismissed: boolean;
}

/** One derived glance row handed to the page/presentational layer. */
export interface RoutineRowView {
  routine: Routine;
  title: string;
  current: number;
  total: number;
  done: boolean;
  missingCount: number;
  streak: number;
  /** First incomplete item's zikr — the deep link's resume point (AC2.3.2). */
  zikrId: number | null;
}

interface RoutinesSectionContainerProps {
  /** Bubbled to the page, which navigates to /counter?routineId=…&zikrId=…. */
  onRoutinePress: (view: RoutineRowView) => void;
  /** Bubbled to the page, which opens the editor dialog (§16.3). */
  onEditRoutine: (routine: Routine) => void;
  /** Bubbled to the page, which opens the editor dialog for a new routine. */
  onCreateRoutine?: () => void;
  /**
   * Chrome bridge from the current-ritual card (§16.1): while that card
   * shows, the quiet offer would duplicate it — the user already has
   * routines — so it stays hidden.
   */
  hideQuietOffer?: boolean;
  /**
   * Chrome bridge out (§16.1): whether the quiet preset offer currently
   * renders. Home uses it to defer the after-salah offer (never two
   * quiet offers at once).
   */
  onOfferVisibilityChange?: (visible: boolean) => void;
  /** Test seam — defaults to the shared wall-clock tick (useNow). */
  now?: Date;
}

/** One labelled group of rows (label omitted for a single-group section). */
function RoutineGroup({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      {label && (
        <p className="px-1 font-caption text-caption text-on-surface-variant/70">{label}</p>
      )}
      {children}
    </div>
  );
}

const RoutinesSectionContainer: React.FC<RoutinesSectionContainerProps> = ({
  onRoutinePress,
  onEditRoutine,
  onCreateRoutine,
  hideQuietOffer = false,
  onOfferVisibilityChange,
  now: nowProp,
}) => {
  const { t } = useI18n();
  const tick = useNow(60_000);
  const now = nowProp ?? tick;
  const routines = useRoutineStore(state => state.routines);
  const createPreset = useRoutineStore(state => state.createPreset);
  const softDelete = useRoutineStore(state => state.softDelete);
  const sessions = useSessionStore(state => state.sessions);
  const zikrs = useZikrStore(state => state.zikrs);
  const presetOffer = useSettingsStore(
    state => state.settings.routinePresetOffer as RoutinePresetOfferSetting | undefined
  );

  const day = useMemo(() => formatDate(now), [now]);

  const sections = useMemo(
    () => routineSections(routines, sessions, zikrs, now),
    [routines, sessions, zikrs, now]
  );

  const viewOf = useCallback(
    (routine: Routine): RoutineRowView => {
      const state = routineTodayState(routine, zikrs, sessions, day);
      const streak = routineStreakStatus(routine, zikrs, sessions, getToday());
      // The resume point: the first incomplete item's zikr (today's
      // derivation — the flow re-derives identically on arrival).
      const resumeIndex = state.done ? -1 : state.current - 1;
      const firstIncomplete = resumeIndex >= 0 ? routine.items[resumeIndex] : undefined;
      // A missing zikr cannot be counted; deep-link the first resolvable
      // incomplete item instead (the flow greys the missing one).
      const zikrId =
        firstIncomplete && state.missingCount === 0
          ? firstIncomplete.zikrId
          : routine.items.find(item => zikrs.some(z => z.id === item.zikrId && !z.deletedAt))
              ?.zikrId ?? null;
      const title =
        routine.source === 'preset' && routine.presetKey
          ? t(`routine.preset.${routine.presetKey}`)
          : routine.title?.trim() ||
            routine.items.map(item => item.name).join(' · ') ||
            t('routine.section');
      return {
        routine,
        title,
        current: state.current,
        total: state.total,
        done: state.done,
        missingCount: state.missingCount,
        streak: streak.value,
        zikrId,
      };
    },
    [zikrs, sessions, day, t]
  );

  // Quiet offer: only while there are NO routines (AC2.4.2), the user
  // actually has cluster zikrs to build from, it was never dismissed, and
  // the current-ritual card isn't already speaking for the routines.
  const offerVisible =
    routines.length === 0 &&
    !hideQuietOffer &&
    !presetOffer?.dismissed &&
    hasPresetClusterZikr(zikrs);

  useEffect(() => {
    onOfferVisibilityChange?.(offerVisible);
  }, [offerVisible, onOfferVisibilityChange]);

  const handlePreset = useCallback(
    (key: RoutinePresetKey) => {
      void createPreset(key);
    },
    [createPreset]
  );

  const handleDismiss = useCallback(() => {
    void useSettingsStore
      .getState()
      .saveSetting('routinePresetOffer', { dismissed: true } satisfies RoutinePresetOfferSetting);
  }, []);

  const handleDelete = useCallback(
    (routine: Routine) => {
      // Explicit user action (AC2.4.3); the in-app confirm guards it.
      void showConfirm({
        message: t('routine.editor.deleteConfirm'),
        danger: true,
        confirmLabel: t('common.delete'),
        cancelLabel: t('common.cancel'),
      }).then(confirmed => {
        if (confirmed) void softDelete(routine.id);
      });
    },
    [softDelete, t]
  );

  const nowViews = sections.now.map(viewOf);
  const upNext = sections.upNext[0]
    ? { view: viewOf(sections.upNext[0].routine), meta: sections.upNext[0] }
    : null;
  const doneViews = sections.done.map(viewOf);
  const anytimeViews = sections.anytime.map(viewOf);
  const rowCount = nowViews.length + (upNext ? 1 : 0) + doneViews.length + anytimeViews.length;
  // Labels scaffold the context only when the section actually has more
  // than one group to tell apart.
  const showLabels =
    [nowViews.length > 0, upNext != null, doneViews.length > 0, anytimeViews.length > 0]
      .filter(Boolean).length > 1;

  // Nothing to show at all → render nothing (P1: default app unchanged).
  if (rowCount === 0 && !offerVisible) return null;

  const renderRow = (view: RoutineRowView) => (
    <RoutineRow
      key={view.routine.id}
      title={view.title}
      current={view.current}
      total={view.total}
      done={view.done}
      missingCount={view.missingCount}
      streak={view.streak}
      onPress={() => onRoutinePress(view)}
      onEdit={() => onEditRoutine(view.routine)}
      onDelete={() => handleDelete(view.routine)}
    />
  );

  return (
    <section className="flex flex-col gap-4 w-full">
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center justify-between">
          <h3 className="font-headline-md text-headline-md text-primary">{t('routine.section')}</h3>
          {onCreateRoutine && routines.length > 0 && (
            <button
              type="button"
              onClick={onCreateRoutine}
              className="flex items-center gap-1 font-label-md text-label-md text-tertiary hover:opacity-80 transition-opacity p-2 -mr-2"
              aria-label={t('routine.editor.createTitle')}
            >
              <MaterialIcon icon="add" className="text-[20px]" />
              {t('common.add')}
            </button>
          )}
        </div>
        <p className="font-caption text-caption text-on-surface-variant">
          {t('routine.sectionSub')}
        </p>
      </div>
      <div className="flex flex-col gap-4">
        {nowViews.length > 0 && (
          <RoutineGroup label={showLabels ? t('routine.now.now') : undefined}>
            {nowViews.map(renderRow)}
          </RoutineGroup>
        )}
        {upNext && (
          <RoutineGroup label={showLabels ? t('routine.sectionUpcoming') : undefined}>
            <RoutineRow
              title={upNext.view.title}
              current={upNext.view.current}
              total={upNext.view.total}
              done={upNext.view.done}
              missingCount={upNext.view.missingCount}
              streak={upNext.view.streak}
              nextLabel={`${t(`routine.now.next.${upNext.meta.nextPart}`)} · ${formatTime(upNext.meta.nextAt)}`}
              onPress={() => onRoutinePress(upNext.view)}
              onEdit={() => onEditRoutine(upNext.view.routine)}
              onDelete={() => handleDelete(upNext.view.routine)}
            />
          </RoutineGroup>
        )}
        {doneViews.length > 0 && (
          <RoutineGroup label={showLabels ? t('routine.doneToday') : undefined}>
            {doneViews.map(renderRow)}
          </RoutineGroup>
        )}
        {anytimeViews.length > 0 && (
          <RoutineGroup label={showLabels ? t('routine.sectionAnytime') : undefined}>
            {anytimeViews.map(renderRow)}
          </RoutineGroup>
        )}
        {offerVisible && <QuietPresetOfferRow onPreset={handlePreset} onDismiss={handleDismiss} />}
      </div>
    </section>
  );
};

export default RoutinesSectionContainer;
