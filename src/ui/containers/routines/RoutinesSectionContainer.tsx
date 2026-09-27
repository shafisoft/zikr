/**
 * RoutinesSectionContainer — the Home routines section (R2, §16.3). The one
 * data-touching tier for the surface: it subscribes to the routine/session/
 * zikr/settings stores, derives every row's today-state via routineUtils
 * (§2.3), and invokes store actions (createPreset, softDelete,
 * saveSetting('routinePresetOffer')). Presentational rows get props in and
 * bubble callbacks out; the page decides navigation (deep-link to the
 * counter flow) and when the editor dialog opens.
 *
 * With no routines: at most one quiet dismissible preset offer (AC2.4.2) —
 * dismissal persists via the `routinePresetOffer` settings KV; no nag
 * (AC2.4.3). Once dismissed (or nothing to offer) the container renders
 * nothing — the default app is unchanged (P1).
 */

import React, { useCallback, useMemo } from 'react';
import MaterialIcon from '../../components/MaterialIcon';
import RoutineRow from '../../components/routines/RoutineRow';
import QuietPresetOfferRow from '../../components/routines/QuietPresetOfferRow';
import { showConfirm } from '../../components/ConfirmDialog';
import { useRoutineStore } from '../../../core/stores/routineStore';
import { useSessionStore } from '../../../core/stores/sessionStore';
import { useZikrStore } from '../../../core/stores/zikrStore';
import { useSettingsStore } from '../../../core/stores/settingsStore';
import { useI18n } from '../../../core/i18n';
import { formatDate, getToday } from '../../../core/utils/dateUtils';
import {
  hasPresetClusterZikr,
  RoutinePresetKey,
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
}

const RoutinesSectionContainer: React.FC<RoutinesSectionContainerProps> = ({
  onRoutinePress,
  onEditRoutine,
  onCreateRoutine,
  hideQuietOffer = false,
}) => {
  const { t } = useI18n();
  const routines = useRoutineStore(state => state.routines);
  const createPreset = useRoutineStore(state => state.createPreset);
  const softDelete = useRoutineStore(state => state.softDelete);
  const sessions = useSessionStore(state => state.sessions);
  const zikrs = useZikrStore(state => state.zikrs);
  const presetOffer = useSettingsStore(
    state => state.settings.routinePresetOffer as RoutinePresetOfferSetting | undefined
  );

  const today = useMemo(() => formatDate(getToday()), []);

  const rows = useMemo<RoutineRowView[]>(
    () =>
      routines.map(routine => {
        const state = routineTodayState(routine, zikrs, sessions, today);
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
      }),
    [routines, zikrs, sessions, today, t]
  );

  // Quiet offer: only while there are NO routines (AC2.4.2), the user
  // actually has cluster zikrs to build from, it was never dismissed, and
  // the current-ritual card isn't already speaking for the routines.
  const offerVisible =
    routines.length === 0 &&
    !hideQuietOffer &&
    !presetOffer?.dismissed &&
    hasPresetClusterZikr(zikrs);

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

  // Nothing to show at all → render nothing (P1: default app unchanged).
  if (rows.length === 0 && !offerVisible) return null;

  return (
    <section className="flex flex-col gap-4 w-full">
      <div className="flex items-center justify-between">
        <h3 className="font-headline-md text-headline-md text-primary">{t('routine.section')}</h3>
        {onCreateRoutine && rows.length > 0 && (
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
      <div className="flex flex-col gap-2">
        {rows.map(view => (
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
        ))}
        {offerVisible && <QuietPresetOfferRow onPreset={handlePreset} onDismiss={handleDismiss} />}
      </div>
    </section>
  );
};

export default RoutinesSectionContainer;
