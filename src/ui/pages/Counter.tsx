/**
 * Counter Screen (V2)
 * Full-screen route around the shared CounterSession. As the counter's
 * caller it owns the inputs: startCount resumes an unsaved personal round
 * from the session store, and target comes from the plan step when the
 * route carries a plan (?planId=, per-zikr plans — which also enables the
 * "continue next zikr" flow), else a plan's ?target=, else the zikr's
 * default. Each count is mirrored back to the session store via onCount so
 * an unfinished round survives navigation. The same CounterSession is
 * embedded by CounterModal (e.g. from a room).
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import AppLayout from '../components/layout/AppLayout';
import { useNavActions } from '../components/navigation/navActions';
import CounterSession from '../components/counter/CounterSession';
import MaterialIcon from '../components/MaterialIcon';
import { useI18n } from '../../core/i18n';
import { useZikrStore } from '../../core/stores/zikrStore';
import { useSessionStore } from '../../core/stores/sessionStore';
import { useSettingsStore } from '../../core/stores/settingsStore';
import { usePlanStore } from '../../core/stores/planStore';
import { planSequence } from '../../core/utils/planUtils';
import { getZikrDisplayInfoFromZikr } from '../utils/zikrMapping';
import { Zikr } from '../../core/db/types';

const Counter: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const navActions = useNavActions();
  const { lang, t } = useI18n();
  const [searchParams] = useSearchParams();
  const zikrIdParam = searchParams.get('zikrId');
  // Plans start the counter toward their own number (?target=N); plain
  // entries (Home, the nav tab) omit it and the zikr's default applies.
  const targetParam = Number(searchParams.get('target'));
  // A per-zikr plan turns the counter into a sequence: after a saved round
  // the user can continue straight to the plan's next zikr.
  const planIdParam = searchParams.get('planId');

  // Store integrations
  const zikrs = useZikrStore(state => state.zikrs);
  const zikrsLoading = useZikrStore(state => state.loading);
  const plans = usePlanStore(state => state.plans);
  const currentSession = useSessionStore(state => state.currentSession);
  const checkpoints = useSessionStore(state => state.checkpoints);
  const setCurrentSession = useSessionStore(state => state.setCurrentSession);
  const hapticsEnabled = useSettingsStore(state => state.settings.hapticsEnabled ?? true);
  const saveSetting = useSettingsStore(state => state.saveSetting);

  const [selectedZikr, setSelectedZikr] = useState<Zikr | null>(null);
  // Resume snapshot: the unsaved count this zikr starts from. Captured once
  // per zikr selection so the counter's startCount stays stable while it
  // counts; the live value is mirrored back through onCount instead.
  const [startCount, setStartCount] = useState(0);
  // True after the first onCount — freezes the snapshot so store updates
  // mirrored FROM the counter never feed back into startCount.
  const interactedRef = useRef(false);
  // True once the user continues to the plan's next zikr — the URL param
  // must stop overriding the in-page selection from then on.
  const selectionLockedRef = useRef(false);

  // The plan behind ?planId= and its countable zikr sequence (per-zikr
  // plans only — see planSequence). Empty until the stores hydrate; the
  // resolution effect below re-runs when they do.
  const plan = useMemo(
    () => (planIdParam ? plans.find(p => p.id === planIdParam) : undefined),
    [plans, planIdParam]
  );
  const planSteps = useMemo(() => planSequence(plan, zikrs), [plan, zikrs]);

  const currentStepIndex =
    selectedZikr && planSteps.length > 0
      ? planSteps.findIndex(step => step.zikr.id === selectedZikr.id)
      : -1;
  const nextStep = currentStepIndex >= 0 ? planSteps[currentStepIndex + 1] : undefined;

  // Load settings (haptics toggle reads/writes the store directly)
  useEffect(() => {
    useSettingsStore.getState().loadSettings();
  }, []);

  // Resolve the zikr to practice: plan step ← URL param → active session →
  // first zikr. Skipped once the user continued to the next plan zikr —
  // the params describe where the counter started, not where it is now.
  useEffect(() => {
    if (selectionLockedRef.current) return;

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
  }, [zikrs, zikrIdParam, currentSession.zikrId, planSteps]);

  // Snapshot the resume count when the zikr selection settles. Resume
  // order: the in-flight round mirror first, then the durable progress
  // checkpoint (auto-saved counts), then zero. Re-runs when the stores
  // hydrate from IndexedDB (their first load can land after this effect's
  // first run), but never after the user started counting.
  useEffect(() => {
    if (!selectedZikr || interactedRef.current) return;
    const zikrKey = selectedZikr.id;
    setStartCount(
      currentSession.zikrId === zikrKey
        ? currentSession.count
        : zikrKey != null
          ? checkpoints[zikrKey] ?? 0
          : 0
    );
  }, [selectedZikr, currentSession, checkpoints]);

  // The page's target: the plan step's target when counting a plan, else a
  // plan-provided ?target= when valid, else the zikr's default.
  const stepTarget = currentStepIndex >= 0 ? planSteps[currentStepIndex].target : undefined;
  const target = selectedZikr
    ? stepTarget && stepTarget > 0
      ? stepTarget
      : Number.isFinite(targetParam) && targetParam > 0
        ? targetParam
        : getZikrDisplayInfoFromZikr(selectedZikr, lang)?.defaultTarget || 33
    : 0;

  // Jump to the plan's next zikr. The resume snapshot is captured here
  // synchronously — a remounted session must never paint this zikr with
  // the previous zikr's base count while the snapshot effect settles.
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

  const handleToggleHaptics = () => {
    void saveSetting('hapticsEnabled', !hapticsEnabled);
  };

  // Leave the counter the way the user came in — back to the originating
  // screen (Home, Goals, …). A direct load (no in-app history to pop) falls
  // back to Home. 'default' is react-router's key for the first entry.
  const leaveCounter = () => {
    if (location.key !== 'default') navigate(-1);
    else navigate('/');
  };

  // Loading state
  if (zikrsLoading) {
    return (
      <div className="min-h-screen bg-surface text-on-surface antialiased flex items-center justify-center">
        <div className="text-on-surface-variant">{t('common.loading')}</div>
      </div>
    );
  }

  // No zikrs available
  if (!selectedZikr) {
    return (
      <div className="min-h-screen bg-surface text-on-surface antialiased flex flex-col items-center justify-center p-8 text-center">
        <MaterialIcon icon="error_outline" className="text-6xl text-tertiary-container mb-4" />
        <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-primary mb-2">
          {t('counter.noZikrs')}
        </h2>
        <p className="font-body-md text-body-md text-on-surface-variant mb-6">
          {t('counter.noZikrsHint')}
        </p>
        <button
          onClick={() => navigate('/')}
          className="bg-primary-container text-on-primary rounded-xl h-touch-target-min px-8 font-label-md"
        >
          {t('counter.goHome')}
        </button>
      </div>
    );
  }

  return (
    <AppLayout
      topBar={{
        title: selectedZikr.name,
        close: true,
        onClose: leaveCounter,
        actions: [
          {
            icon: hapticsEnabled ? 'vibration' : 'smartphone',
            onClick: handleToggleHaptics,
            ariaLabel: 'Toggle haptic feedback',
          },
          ...navActions,
        ],
      }}
      contentClassName="px-container-padding-mobile"
    >
      <CounterSession
        key={selectedZikr.id}
        zikr={selectedZikr}
        startCount={startCount}
        target={target}
        onCount={(count) => {
          interactedRef.current = true;
          setCurrentSession({ zikrId: selectedZikr.id || null, count });
        }}
        onContinueNext={nextStep ? handleContinueNext : undefined}
        variant="page"
        onFinish={leaveCounter}
      />
    </AppLayout>
  );
};

export default Counter;
