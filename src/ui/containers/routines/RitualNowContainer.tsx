/**
 * RitualNowContainer — the Home "current ritual" slot (Feature C, §16
 * composition). The one data-touching tier for the card: it subscribes to
 * the routine/session/zikr stores, derives the now/next state via
 * routineNowState (civil windows, §5.1 schedule metadata), and bubbles the
 * Start tap up — the page navigates the counter deep link.
 *
 * Render decision: the FIRST entry of the ordered now-state — current and
 * undone first, then current-but-done (compact reinforcement), then the
 * next-upcoming with its window label. While R1's post-salah card is
 * active the moment is already spoken for, so the card shows the NEXT
 * routine instead (never two cards claiming the same moment); with nothing
 * upcoming it renders nothing.
 *
 * `onPresentChange` is the §16.1 chrome bridge: the page suppresses the
 * quiet preset offer while this card shows (the user already has
 * routines). The page subscribes to nothing to acquire the fact.
 */

import React, { useEffect, useMemo } from 'react';
import RitualNowCard from '../../components/routines/RitualNowCard';
import { useRoutineStore } from '../../../core/stores/routineStore';
import { useSessionStore } from '../../../core/stores/sessionStore';
import { useZikrStore } from '../../../core/stores/zikrStore';
import { useI18n } from '../../../core/i18n';
import useNow from '../../hooks/useNow';
import { formatDate } from '../../../core/utils/dateUtils';
import {
  RoutineNowEntry,
  routineNowState,
  routineTodayState,
} from '../../../core/utils/routineUtils';

interface RitualNowContainerProps {
  /** R1 leads: while its card is active, show the NEXT routine instead. */
  postSalahActive?: boolean;
  /** §16.1 chrome bridge: whether the card currently renders. */
  onPresentChange?: (present: boolean) => void;
  /** Test seam — defaults to the shared wall-clock tick (useNow). */
  now?: Date;
  /** Bubbled: the page navigates to /counter?routineId=…&zikrId=…. */
  onStart: (routineId: string, zikrId: number | null) => void;
}

const RitualNowContainer: React.FC<RitualNowContainerProps> = ({
  postSalahActive = false,
  onPresentChange,
  now: nowProp,
  onStart,
}) => {
  const { t } = useI18n();
  const tick = useNow(60_000);
  const now = nowProp ?? tick;
  const routines = useRoutineStore(state => state.routines);
  const sessions = useSessionStore(state => state.sessions);
  const zikrs = useZikrStore(state => state.zikrs);

  const entries = useMemo<RoutineNowEntry[]>(
    () => routineNowState(routines, sessions, zikrs, now),
    [routines, sessions, zikrs, now]
  );

  // R1 owns the "moment": while its card is active, skip the now-tier.
  const view = useMemo(
    () =>
      postSalahActive
        ? entries.find(entry => entry.when === 'next')
        : entries[0],
    [entries, postSalahActive]
  );

  const day = useMemo(() => formatDate(now), [now]);
  const today = useMemo(
    () => (view ? routineTodayState(view.routine, zikrs, sessions, day) : null),
    [view, zikrs, sessions, day]
  );

  // The resume point: the first incomplete item's zikr (today's derivation —
  // the flow re-derives identically on arrival), falling back to the first
  // resolvable item the way the section rows do.
  const resumeZikrId = useMemo(() => {
    if (!view || !today) return null;
    const routine = view.routine;
    const resumeIndex = today.done ? -1 : today.current - 1;
    const firstIncomplete = resumeIndex >= 0 ? routine.items[resumeIndex] : undefined;
    if (firstIncomplete && today.missingCount === 0) return firstIncomplete.zikrId;
    return (
      routine.items.find(item =>
        zikrs.some(z => z.id === item.zikrId && !z.deletedAt)
      )?.zikrId ?? null
    );
  }, [view, today, zikrs]);

  const title = useMemo(() => {
    if (!view) return '';
    const routine = view.routine;
    if (routine.source === 'preset' && routine.presetKey) {
      return t(`routine.preset.${routine.presetKey}`);
    }
    return (
      routine.title?.trim() ||
      routine.items.map(item => item.name).join(' · ') ||
      t('routine.section')
    );
  }, [view, t]);

  const timeLabel = useMemo(() => {
    if (!view) return '';
    if (view.when === 'next' && view.nextPart) {
      return t(`routine.now.next.${view.nextPart}`);
    }
    return t('routine.now.now');
  }, [view, t]);

  const present = view != null;
  useEffect(() => {
    onPresentChange?.(present);
  }, [present, onPresentChange]);

  if (!view) return null;

  return (
    <RitualNowCard
      title={title}
      timeLabel={timeLabel}
      isNext={view.when === 'next'}
      doneToday={view.doneToday}
      doneCount={view.doneCount}
      total={view.total}
      onStart={() => onStart(view.routine.id, resumeZikrId)}
    />
  );
};

export default RitualNowContainer;
