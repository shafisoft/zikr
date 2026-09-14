/**
 * Update banner — the PWA "new version available" prompt.
 *
 * Deployed bundles change on every push, but a running service worker keeps
 * serving the previously precached app until the updated one activates.
 * Without this banner, users (especially installed-PWA users) stay on the
 * old version for one or more visits. `updateServiceWorker(true)` activates
 * the waiting worker and reloads into the new bundle.
 */

import React from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import MaterialIcon from './MaterialIcon';
import { useI18n } from '../../core/i18n';

export const UpdateBanner: React.FC = () => {
  const { t } = useI18n();
  const {
    offlineReady: [, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    // Long-lived installed PWAs: check hourly while the app is open.
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      setInterval(() => {
        void registration.update();
      }, 60 * 60 * 1000);
    },
  });

  // Offline-ready is silent by design: it answers a question nobody asked,
  // so only a real pending update interrupts the user.
  if (!needRefresh) return null;

  const dismiss = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
  };

  return (
    <div
      role="alert"
      className="fixed top-20 left-1/2 -translate-x-1/2 z-[60] w-[92%] max-w-md
        bg-surface-container-high border border-tertiary-container/40 rounded-xl shadow-card
        px-4 py-3 flex items-center justify-between gap-3"
    >
      <span className="font-label-md text-label-md text-on-surface flex items-center gap-2 min-w-0">
        <MaterialIcon icon="system_update_alt" className="text-[18px] text-tertiary" />
        <span className="truncate">{t('update.newVersion')}</span>
      </span>
      <button
        onClick={() => updateServiceWorker(true)}
        className="shrink-0 h-9 px-3 rounded-lg bg-primary-container text-on-primary font-label-md text-label-md flex items-center gap-1 active-scale-95"
      >
        <MaterialIcon icon="refresh" className="text-[16px]" />
        {t('update.reload')}
      </button>
      <button onClick={dismiss} aria-label={t('common.close')} className="shrink-0 text-on-surface-variant">
        <MaterialIcon icon="close" className="text-[18px]" />
      </button>    </div>
  );
};

export default UpdateBanner;
