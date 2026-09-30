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

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  const computePlanProgress = usePlanStore(state => state.computePlanProgress);
  const plans = usePlanStore(state => state.plans);
  const routines = useRoutineStore(state => state.routines);
  const prayerLocation = useSettingsStore(
    state => state.settings.prayerLocation as PrayerLocation | undefined
  );

  // ----- Plain + plan selection state (page logic, verbatim) -----
  const [selectedZikr, setSelectedZikr] = useState<Zikr | null>(null);
  const plainTouchedRef = useRef(false);
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
  // Day totals are SCOPED to this routine: its own guided saves always
  // count; free counting counts only in the routine's part of day — so the
  // morning preset's completion never satisfies the evening preset's
  // identical items (sessionCountsTowardRoutine).
  const todayCounts = useMemo(
    () => routineDayTotals(sessions, formatDate(getToday()), routine ?? undefined),
    [sessions, routine]
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

  // ----- Seed from the plan's displayed progress (what the row showed) -----
  // Only personal plans resolve here (usePlanStore); group mirrors keep the
  // round-based counter — their displayed total includes other members, so
  // seeding from it would undercount the user's own contribution. The seed
  // is the ALREADY-SAVED portion: the board resumes there and saves only
  // the delta (CounterSession.resumedBase).
  const planSeedFor = useCallback(
    (zikrId: number | null | undefined): number => {
      if (!plan || plan.status !== 'active') return 0;
      const progress = computePlanProgress(plan, sessions);
      if (plan.mode === 'per-zikr') {
        const zp = progress.perZikr.find(p => p.zikrId === zikrId);
        return zp && zp.target > 0 ? Math.min(zp.currentCount, zp.target) : 0;
      }
      return plan.target && plan.target > 0
        ? Math.min(progress.currentCount, plan.target)
        : 0;
    },
    [plan, sessions, computePlanProgress]
  );

  // ----- The active step across sources -----
  const activeZikr = derivedFlow
    ? derivedStep?.zikr ?? null
    : selectedZikr;
  // The step name is display content — always localized (bn shows the
  // Bangla name, per AC2.1.2), never the raw catalog key.
  const activeStepName = activeZikr
    ? getZikrDisplayInfoFromZikr(activeZikr, lang).localizedName
    : null;

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
    onActiveStep(activeZikr ? getZikrDisplayInfoFromZikr(activeZikr, lang).localizedName : null);
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

  // Resume snapshot for plain/plan: computed DURING RENDER (the derived
  // analogue below does the same) so a mounting step paints its resume
  // count on first paint — a post-mount state update would never reach the
  // board's useState(startCount). The mirror (unsaved round) rides first,
  // then the durable checkpoint, then zero — plus the plan's already-saved
  // progress when opening from a personal plan row, so the board starts at
  // the number the row displayed (260/1000 → 260). Until the first tap the
  // snapshot tracks store hydration (a late-arriving checkpoint still
  // paints); once touched, the board is frozen — mid-count store updates
  // (a save clearing its checkpoint) never re-base it.
  const [plainBoard, setPlainBoard] = useState<BoardSnapshot>({
    stepId: null,
    startCount: 0,
  });
  const plainStepId = selectedZikr?.id ?? null;
  if (!derivedFlow && (plainStepId !== plainBoard.stepId || !plainTouchedRef.current)) {
    const mirror = plainStepId != null && currentSession.zikrId === plainStepId
      ? currentSession.count
      : 0;
    const checkpoint = plainStepId != null ? checkpoints[plainStepId] ?? 0 : 0;
    const startCount = planSeedFor(plainStepId) + Math.max(mirror, checkpoint);
    if (plainStepId !== plainBoard.stepId || startCount !== plainBoard.startCount) {
      setPlainBoard({ stepId: plainStepId, startCount });
    }
  }

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
    // The next step's board snapshot (its own plan seed + any checkpointed
    // unsaved count) re-computes during render from the step change.
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
    // First tap freezes the plain/plan snapshot (the render-time block).
    plainTouchedRef.current = true;
    setCurrentSession({ zikrId: activeZikr?.id || null, count });
  };

  // ----- Exit flush: leaving the counter saves what you counted -----
  // The board reports its live unsaved remainder; when the flow unmounts
  // (Close, back, route change) the remainder becomes a real session — so
  // partial progress (100 of a 1000 target) is on the books everywhere
  // instead of hiding in a checkpoint. The checkpoint then clears, or the
  // next open would re-count what was just saved. The mirror rides along
  // when it belongs to the same zikr. A tab close / app kill can't run
  // this — the durable checkpoint remains the safety net there.
  const activeZikrRef = useRef(activeZikr);
  activeZikrRef.current = activeZikr;
  const routineIdRef = useRef(routine?.id);
  routineIdRef.current = routine?.id;
  const unsavedRef = useRef<{ zikrId: number; zikrName: string; amount: number } | null>(null);
  const handleUnsavedChange = useCallback((unsaved: number) => {
    const zikr = activeZikrRef.current;
    unsavedRef.current =
      zikr?.id != null && unsaved > 0
        ? { zikrId: zikr.id, zikrName: zikr.name, amount: unsaved }
        : null;
  }, []);

  useEffect(() => {
    return () => {
      const pending = unsavedRef.current;
      unsavedRef.current = null;
      if (!pending || pending.amount <= 0) return;
      void (async () => {
        try {
          await useSessionStore.getState().recordCount({
            zikrId: pending.zikrId,
            zikrName: pending.zikrName,
            count: pending.amount,
            routineId: routineIdRef.current,
          });
        } catch (error) {
          console.error('Failed to save the unsaved count on exit:', error);
          return; // the checkpoint still holds the remainder
        }
        const mirror = useSessionStore.getState().currentSession;
        if (mirror.zikrId === pending.zikrId) {
          useSessionStore.getState().clearCurrentSession();
        }
        void useSessionStore.getState().clearProgressCheckpoint(pending.zikrId);
      })();
    };
  }, []);

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
      startCount={derivedFlow ? flowBoard.startCount : plainBoard.startCount}
      target={target}
      onCount={handleCount}
      onContinueNext={derivedFlow ? undefined : nextStep ? handleContinueNext : undefined}
      resumedBase={!derivedFlow && planSeedFor(activeZikr.id) > 0}
      routineId={routine?.id}
      onUnsavedChange={handleUnsavedChange}
      flowMode={derivedFlow != null}
      variant="page"
      onFinish={onFinish}
    />
  );
};

export default CounterFlowContainer;
