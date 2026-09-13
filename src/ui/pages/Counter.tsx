/**
 * Counter Screen (V2)
 * Full-screen route around the shared CounterSession. As the counter's
 * caller it owns the inputs: startCount resumes an unsaved personal round
 * from the session store, and target comes from the zikr's default. Each
 * count is mirrored back to the session store via onCount so an unfinished
 * round survives navigation. The same CounterSession is embedded by
 * CounterModal (e.g. from a room).
 */

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AppLayout from '../components/layout/AppLayout';
import { useNavActions } from '../components/navigation/navActions';
import CounterSession from '../components/counter/CounterSession';
import MaterialIcon from '../components/MaterialIcon';
import { useI18n } from '../../core/i18n';
import { useZikrStore } from '../../core/stores/zikrStore';
import { useSessionStore } from '../../core/stores/sessionStore';
import { useSettingsStore } from '../../core/stores/settingsStore';
import { getZikrDisplayInfoFromZikr } from '../utils/zikrMapping';
import { Zikr } from '../../core/db/types';

const Counter: React.FC = () => {
  const navigate = useNavigate();
  const navActions = useNavActions();
  const { lang, t } = useI18n();
  const [searchParams] = useSearchParams();
  const zikrIdParam = searchParams.get('zikrId');

  // Store integrations
  const zikrs = useZikrStore(state => state.zikrs);
  const zikrsLoading = useZikrStore(state => state.loading);
  const currentSession = useSessionStore(state => state.currentSession);
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

  // Load settings (haptics toggle reads/writes the store directly)
  useEffect(() => {
    useSettingsStore.getState().loadSettings();
  }, []);

  // Resolve the zikr to practice: URL param → active session → first zikr.
  useEffect(() => {
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
  }, [zikrs, zikrIdParam, currentSession.zikrId]);

  // Snapshot the resume count when the zikr selection settles. Re-runs when
  // the session store hydrates from IndexedDB (its first load can land after
  // this effect's first run), but never after the user started counting.
  useEffect(() => {
    if (!selectedZikr || interactedRef.current) return;
    setStartCount(
      currentSession.zikrId === selectedZikr.id ? currentSession.count : 0
    );
  }, [selectedZikr, currentSession]);

  // The page's target is the zikr's default.
  const target = selectedZikr
    ? getZikrDisplayInfoFromZikr(selectedZikr, lang)?.defaultTarget || 33
    : 0;

  const handleToggleHaptics = () => {
    void saveSetting('hapticsEnabled', !hapticsEnabled);
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
        onClose: () => navigate('/'),
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
        zikr={selectedZikr}
        startCount={startCount}
        target={target}
        onCount={(count) => {
          interactedRef.current = true;
          setCurrentSession({ zikrId: selectedZikr.id || null, count });
        }}
        variant="page"
        onFinish={() => navigate('/?completed=true')}
      />
    </AppLayout>
  );
};

export default Counter;
