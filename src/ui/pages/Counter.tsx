/**
 * Screen (V2)
 * Full-screen route around the shared CounterSession. Route state and
 * chrome only (§16.4): the page parses the source params
 * (?zikrId/target/planId/routineId/postSalah), owns AppLayout chrome (the top-bar
 * title arrives via the flow container's onActiveStep callback), the
 * pre-existing haptics top-bar action, and leaveCounter. All data
 * ownership — step sequences, flow position, resume snapshots, advancement
 * — lives in CounterFlowContainer, which wraps the unchanged CounterSession.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import AppLayout from '../components/layout/AppLayout';
import { useNavActions } from '../components/navigation/navActions';
import CounterFlowContainer from '../containers/counter/CounterFlowContainer';
import MaterialIcon from '../components/MaterialIcon';
import { useI18n } from '../../core/i18n';
import { useSettingsStore } from '../../core/stores/settingsStore';
import { useZikrStore } from '../../core/stores/zikrStore';

const Counter: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const navActions = useNavActions();
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  // Plans start the counter toward their own number (?target=N); plain
  // entries (Home, the nav tab) omit it and the zikr's default applies.
  const targetParam = Number(searchParams.get('target'));
  // The four flow sources (§16.4): a per-zikr plan sequence, a routine's
  // guided item-by-item flow, the after-salah set (?postSalah= — R1), or
  // a plain single-zikr counter.
  const planIdParam = searchParams.get('planId');
  const routineIdParam = searchParams.get('routineId');
  const postSalahParam = searchParams.get('postSalah');
  const zikrIdParam = searchParams.get('zikrId');

  // Store integrations (chrome-level only). The terminal empty state reads
  // the library straight from the store — never from the container's
  // chrome-bridge report, whose first (pre-selection) value is legitimately
  // null and must not unmount the container mid-resolution (R2 deadlock).
  const zikrsLoading = useZikrStore(state => state.loading);
  const zikrs = useZikrStore(state => state.zikrs);
  const hapticsEnabled = useSettingsStore(state => state.settings.hapticsEnabled ?? true);
  const saveSetting = useSettingsStore(state => state.saveSetting);

  // Chrome bridge (§16.1): the flow container reports the active step's
  // name for the top bar; the page keeps it as plain flow state and never
  // subscribes to acquire it. undefined = not yet resolved; null = no step.
  const [activeStepName, setActiveStepName] = useState<string | null | undefined>(undefined);

  // Load settings (haptics toggle reads/writes the store directly)
  useEffect(() => {
    useSettingsStore.getState().loadSettings();
  }, []);

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

  // Terminal empty state: ONLY from the page's own store knowledge — the
  // library is loaded and empty. A null activeStepName is NOT this state:
  // it is also the container's legitimate first report before it resolves
  // the route's zikr (gating on it unmounted the container before its
  // selection effect could land — the plain counter deadlocked on empty).
  // Non-empty-library degenerate routes (a routine whose items are all
  // unresolvable) render in-flow inside the container, not here.
  if (!zikrsLoading && zikrs.length === 0) {
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
        title: activeStepName ?? undefined,
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
      <CounterFlowContainer
        zikrIdParam={zikrIdParam}
        targetParam={targetParam}
        planIdParam={planIdParam}
        routineIdParam={routineIdParam}
        postSalahParam={postSalahParam}
        onFinish={leaveCounter}
        onActiveStep={setActiveStepName}
      />
    </AppLayout>
  );
};

export default Counter;
