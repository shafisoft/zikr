/**
 * CounterFlowContainer — the ONE data owner of the counter surface
 * (§16.4), for all flow sources: plain · ?planId= · ?routineId= ·
 * ?postSalah=. The page (Counter.tsx) keeps route state and chrome; this
 * container owns the step sequence, flow position, resume snapshots, and
 * advancement, and renders the reused CounterSession (or the calm
 * FlowDoneCard when a derived flow's position passes the last item).
 *
 * Flow position is DERIVED — "the first incomplete item, re-derived from
 * today's sessions on every render" (§16.4). There is no second copy of
 * position state to desync: an Undo that drops an item below target makes
 * the routine/post-salah flow's position step back onto that item on the
 * next render (OQ-3), and a quit-and-return resumes exactly there
 * (AC2.3.2 / AC1.3.3).
 *
 * The post-salah flow (R1, §4.6) attributes to the PRAYER OCCURRENCE:
 * a step's remaining count is the catalog target minus the sessions whose
 * TIMESTAMP falls inside the occurrence's 30-minute window (§2.3), so
 * ordinary earlier-today sessions can never masquerade as the set
 * (AC1.2.3). Flow visibility is ROUTE state — ambient window expiry does
 * not unmount the flow (§4.6); attribution keeps using the occurrence
 * interval.
 *
 * The plain and plan logic below is Counter.tsx's page logic moved
 * verbatim (§16.4) — a plain source renders today's counter bit-for-bit.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import CounterSession from '../../components/counter/CounterSession';
import FlowDoneCard from '../../components/counter/FlowDoneCard';
import { useI18n } from '../../../core/i18n';
import { useZikrStore } from '../../../core/stores/zikrStore';
import { useSessionStore } from '../../../core/stores/sessionStore';
import { usePlanStore } from '../../../core/stores/planStore';
import { useRoutineStore } from '../../../core/stores/routineStore';
import { useSettingsStore } from '../../../core/stores/settingsStore';
import { planSequence } from '../../../core/utils/planUtils';
import {
  routineDayTotals,
  routineMissingCount,
  routineSequence,
} from '../../../core/utils/routineUtils';
import {
  postSalahSequence,
  postSalahWindow,
  windowCounts,
} from '../../../core/utils/prayerTimes';
import type { PrayerLocation } from '../../../core/db/types';
import type { PrayerName } from '../../../core/utils/prayerTimes';
import { formatDate, getToday } from '../../../core/utils/dateUtils';
import { getZikrDisplayInfoFromZikr } from '../../utils/zikrMapping';
import type { Zikr } from '../../../core/db/types';

const PRAYER_NAMES: readonly PrayerName[] = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

interface CounterFlowContainerProps {
  /** Route params, parsed by the page (§16.4 — the page owns route state). */
  zikrIdParam: string | null;
  targetParam: number;
  planIdParam: string | null;
  routineIdParam: string | null;
  postSalahParam: string | null;
  /** "Done"/finish bubbles up — the page owns leaveCounter. */
  onFinish: (savedCount: number) => void;
  /** Chrome bridge (§16.1): the active step's name for the top bar; null when none. */
  onActiveStep: (name: string | null) => void;
}

interface BoardSnapshot {
  stepId: number | null;
  startCount: number;
}

const CounterFlowContainer: React.FC<CounterFlowContainerProps> = ({
  zikrIdParam,
  targetParam,
  planIdParam,
  routineIdParam,
  postSalahParam,
  onFinish,
  onActiveStep,
}) => {
  const { lang, t } = useI18n();

  // ----- Subscriptions (§16.4) -----
  const zikrs = useZikrStore(state => state.zikrs);
  const sessions = useSessionStore(state => state.sessions);
  const currentSession = useSessionStore(state => state.currentSession);
  const checkpoints = useSessionStore(state => state.checkpoints);
  const setCurrentSession = useSessionStore(state => state.setCurrentSession);
  const plans = usePlanStore(state => state.plans);
  const routines = useRoutineStore(state => state.routines);
  const prayerLocation = useSettingsStore(
    state => state.settings.prayerLocation as PrayerLocation | undefined
  );

  // ----- Plain + plan selection state (page logic, verbatim) -----
  const [selectedZikr, setSelectedZikr] = useState<Zikr | null>(null);
  const [startCount, setStartCount] = useState(0);
  const interactedRef = useRef(false);
  const selectionLockedRef = useRef(false);

  // ----- Which derived flow is this? (routine first — its route wins) -----
  const routine = useMemo(
    () => routines.find(r => r.id === routineIdParam && !r.deletedAt),
    [routines, routineIdParam]
  );
  const routineFlow = routine != null;
  const postSalahPrayer: PrayerName | null =
    postSalahParam && (PRAYER_NAMES as readonly string[]).includes(postSalahParam)
      ? (postSalahParam as PrayerName)
      : null;
  // No saved location → the post-salah feature is invisible (AC1.1.1); a
  // stray ?postSalah= URL degrades to the plain counter, not an error.
  const postSalahFlow = !routineFlow && postSalahPrayer != null && prayerLocation != null;
  const derivedFlow: 'routine' | 'postSalah' | null = routineFlow
    ? 'routine'
    : postSalahFlow
      ? 'postSalah'
      : null;

  // ----- Routine flow: DERIVED position (§5.2/§16.4 — no position state) -----
  const todayCounts = useMemo(
    () => routineDayTotals(sessions, formatDate(getToday())),
    [sessions]
  );
  // Steps carry the REMAINING count as their target: item target minus what
  // today's sessions (any source) already contributed to it, allocated
  // positionally across duplicate occurrences.
  const routineSteps = useMemo(
    () => routineSequence(routine, zikrs, todayCounts),
    [routine, zikrs, todayCounts]
  );
  const missingCount = useMemo(
    () => (routine ? routineMissingCount(routine, zikrs) : 0),
    [routine, zikrs]
  );

  // ----- Post-salah flow: DERIVED position over the occurrence (§4.6) -----
  // The occurrence this run attributes to: the ACTIVE window when open,
  // else the most recent occurrence of the prayer that already started —
  // the route state outlives the card's ambient window (§4.6).
  const postSalahOccurrence = useMemo(() => {
    if (!postSalahPrayer || !prayerLocation) return null;
    const win = postSalahWindow(prayerLocation, new Date());
    if (!win) return null;
    const now = Date.now();
    const matching = win.all.filter(o => o.prayer === postSalahPrayer);
    return (
      matching.find(o => o.start.getTime() <= now && now < o.end.getTime()) ??
      [...matching].reverse().find(o => o.start.getTime() <= now) ??
      null
    );
    // Recomputed when the source changes; `new Date()` is the route-open
    // "now" — flow visibility is route state, not window state (§16.4).
  }, [postSalahPrayer, prayerLocation]);
  const postSalahInWindow = useMemo(
    () =>
      postSalahOccurrence
        ? windowCounts(postSalahOccurrence, sessions)
        : new Map<number, number>(),
    [postSalahOccurrence, sessions]
  );
  const postSalahSteps = useMemo(
    () => postSalahSequence(zikrs, postSalahInWindow),
    [zikrs, postSalahInWindow]
  );

  // ----- The derived step (both flows: first incomplete, from sessions) -----
  const derivedSteps = routineFlow ? routineSteps : postSalahSteps;
  const derivedPositionIndex = derivedSteps.findIndex(step => step.target > 0);
  const derivedStep = derivedPositionIndex >= 0 ? derivedSteps[derivedPositionIndex] : undefined;
  // Done-today = every resolvable step complete AND nothing missing (a
  // missing zikr blocks completion, §5.2). The stuck case renders the calm
  // done card with the gentle missing line.
  const derivedDone =
    derivedFlow != null && derivedSteps.length > 0 && derivedPositionIndex === -1;

  // The derived flow's board snapshot re-derives with its step: the mirror
  // (unsaved round) first, then the durable checkpoint (the resume, §2.3).
  // Adjusted during render so a remounted step paints its own resume count
  // on first paint (the derived analogue of the page's snapshot effect).
  const [flowBoard, setFlowBoard] = useState<BoardSnapshot>({
    stepId: null,
    startCount: 0,
  });
  const derivedStepId = derivedStep?.zikr.id ?? null;
  if (derivedFlow && derivedStepId !== flowBoard.stepId) {
    const mirror =
      derivedStepId != null && currentSession.zikrId === derivedStepId
        ? currentSession.count
        : 0;
    const checkpoint = derivedStepId != null ? checkpoints[derivedStepId] ?? 0 : 0;
    setFlowBoard({ stepId: derivedStepId, startCount: Math.max(mirror, checkpoint) });
  }

  // ----- Plan sequence (page logic, verbatim) -----
  const plan = useMemo(
    () => (planIdParam ? plans.find(p => p.id === planIdParam) : undefined),
    [plans, planIdParam]
  );
  const planSteps = useMemo(() => planSequence(plan, zikrs), [plan, zikrs]);

  // ----- The active step across sources -----
  const activeZikr = derivedFlow
    ? derivedStep?.zikr ?? null
    : selectedZikr;
  const activeStepName = activeZikr?.name ?? null;

  const currentStepIndex =
    !derivedFlow && activeZikr && planSteps.length > 0
      ? planSteps.findIndex(step => step.zikr.id === activeZikr.id)
      : -1;
  const nextStep = currentStepIndex >= 0 ? planSteps[currentStepIndex + 1] : undefined;

  // ----- Chrome bridge: report the active step (or done/none) -----
  const routineTitle = useMemo(() => {
    if (!routine) return null;
    if (routine.source === 'preset' && routine.presetKey) {
      return t(`routine.preset.${routine.presetKey}`);
    }
    return routine.title?.trim() || routine.items.map(i => i.name).join(' · ') || null;
  }, [routine, t]);

  useEffect(() => {
    if (derivedFlow === 'routine') {
      // Done / stuck state: the top bar names the routine, not a step.
      onActiveStep(derivedDone || !derivedStep ? routineTitle : activeStepName);
      return;
    }
    if (derivedFlow === 'postSalah') {
      // Same rule: done (or unresolvable) names the flow, not a step.
      onActiveStep(derivedDone || !derivedStep ? t('postSalah.flow.title') : activeStepName);
      return;
    }
    onActiveStep(activeZikr ? activeZikr.name : null);
    // Report whenever any of the underlying inputs change; the page only
    // mirrors the name into chrome.
  }, [derivedFlow, derivedDone, derivedStep, activeZikr, activeStepName, routineTitle, onActiveStep, t]);

  // ----- Plain + plan resolution (page logic, verbatim; flows derive) -----
  useEffect(() => {
    if (derivedFlow || selectionLockedRef.current) return;

    if (planSteps.length > 0) {
      const initial = zikrIdParam
        ? planSteps.find(step => step.zikr.id === Number(zikrIdParam))
        : undefined;
      setSelectedZikr((initial ?? planSteps[0]).zikr);
      return;
    }

    if (zikrs.length === 0) return;

    let zikrToUse: Zikr | undefined;

    if (zikrIdParam) {
      zikrToUse = zikrs.find(z => z.id === Number(zikrIdParam));
    } else if (currentSession.zikrId) {
      zikrToUse = zikrs.find(z => z.id === currentSession.zikrId);
    }

    if (!zikrToUse) {
      zikrToUse = zikrs[0];
    }

    setSelectedZikr(zikrToUse ?? null);
  }, [derivedFlow, zikrs, zikrIdParam, currentSession.zikrId, planSteps]);

  // Resume snapshot for plain/plan (page logic, verbatim): the unsaved
  // round mirror first, then the durable checkpoint, then zero. The
  // derived flows compute their snapshot during render (above).
  useEffect(() => {
    if (derivedFlow || !selectedZikr || interactedRef.current) return;
    const zikrKey = selectedZikr.id;
    setStartCount(
      currentSession.zikrId === zikrKey
        ? currentSession.count
        : zikrKey != null
          ? checkpoints[zikrKey] ?? 0
          : 0
    );
  }, [derivedFlow, selectedZikr, currentSession, checkpoints]);

  // ----- Targets -----
  const planStepTarget = currentStepIndex >= 0 ? planSteps[currentStepIndex].target : undefined;
  const target = derivedFlow
    ? derivedStep?.target ?? 0
    : activeZikr
      ? planStepTarget && planStepTarget > 0
        ? planStepTarget
        : Number.isFinite(targetParam) && targetParam > 0
          ? targetParam
          : getZikrDisplayInfoFromZikr(activeZikr, lang)?.defaultTarget || 33
      : 0;

  // ----- Advancement (§16.4: lives HERE, never in the component) -----
  // Plan flow (page logic, verbatim): jump to the plan's next zikr with a
  // synchronous resume snapshot.
  const handleContinueNext = () => {
    if (!nextStep) return;
    selectionLockedRef.current = true;
    const unsaved = useSessionStore.getState().currentSession;
    const nextZikrId = nextStep.zikr.id;
    setStartCount(
      nextZikrId != null && unsaved.zikrId === nextZikrId
        ? unsaved.count
        : nextZikrId != null
          ? checkpoints[nextZikrId] ?? 0
          : 0
    );
    interactedRef.current = true;
    setSelectedZikr(nextStep.zikr);
  };
  // The derived flows need no handler: the position IS the derivation, so
  // the auto-save's session write advances the flow on the next render
  // (and an Undo steps it back the same way — OQ-3). No onContinueNext
  // is passed.

  const handleCount = (count: number) => {
    if (derivedFlow) {
      // Mirror the derived step's unsaved count; the derived snapshot above
      // reads it back when the step (re)mounts.
      setCurrentSession({ zikrId: derivedStepId, count });
      return;
    }
    interactedRef.current = true;
    setCurrentSession({ zikrId: activeZikr?.id || null, count });
  };

  // ----- Render -----
  if (derivedFlow && (derivedDone || !derivedStep)) {
    // The calm done state (AC1.3.6 / AC2.3.3) — or its gentle variant when
    // a missing zikr blocks completion (§5.2: the sequence cannot complete
    // while an item is unresolvable). Post-salah items missing from the
    // library are simply skipped (matching occurrenceDone), so its done
    // state is the ordinary calm line.
    const setLine =
      derivedFlow === 'postSalah'
        ? t('postSalah.flow.doneLine')
        : missingCount > 0
          ? t('routine.doneMissingLine')
          : t('routine.doneLine');
    return (
      <FlowDoneCard setLine={setLine} onDone={() => onFinish(0)} />
    );
  }

  if (!activeZikr) {
    // Unresolvable plain/plan flow (no zikrs). The page renders its chrome
    // around a reported null step.
    return null;
  }

  return (
    <CounterSession
      key={activeZikr.id}
      zikr={activeZikr}
      startCount={derivedFlow ? flowBoard.startCount : startCount}
      target={target}
      onCount={handleCount}
      onContinueNext={derivedFlow ? undefined : nextStep ? handleContinueNext : undefined}
      flowMode={derivedFlow != null}
      variant="page"
      onFinish={onFinish}
    />
  );
};

export default CounterFlowContainer;
