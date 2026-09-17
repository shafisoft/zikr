/**
 * Install banner — nudges browser users to install the PWA.
 *
 * Chromium fires `beforeinstallprompt` once the app is installable; we
 * capture it (suppressing the browser's own mini-infobar) and offer a
 * one-tap "Install" button. iOS Safari has no programmatic prompt, so
 * there the banner shows the manual "Share → Add to Home Screen" steps.
 * Browsers with neither path (Firefox, desktop Safari) see nothing —
 * a nudge without an action is noise.
 *
 * The banner never nags: it auto-closes after a few seconds (once per
 * browser session), and closing it by hand (or dismissing the install
 * prompt) silences it for a week. Already-installed sessions
 * (`display-mode: standalone`) never see it.
 */

import React, { useEffect, useState } from 'react';
import MaterialIcon from './MaterialIcon';
import { useI18n } from '../../core/i18n';

const DISMISS_KEY = 'zikr-install-dismissed-at';
const SESSION_SHOWN_KEY = 'zikr-install-banner-shown';
const DISMISS_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
const AUTO_CLOSE_MS = 10_000;

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let capturedPrompt: BeforeInstallPromptEvent | null = null;
type PromptListener = () => void;
const promptListeners = new Set<PromptListener>();

function notifyPromptListeners() {
  promptListeners.forEach((fn) => fn());
  promptListeners.clear();
}

function isStandalone(): boolean {
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    nav.standalone === true
  );
}

function isIos(): boolean {
  // iPadOS 13+ reports as Mac with touch support.
  return (
    /iphone|ipad|ipod/i.test(window.navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

/**
 * Whether the banner may show right now (not installed, not shown this
 * session, not in the dismiss cooldown). Shared with the module-level
 * `beforeinstallprompt` handler so we only suppress the browser's own
 * install affordance when our banner will actually replace it.
 */
function suppressed(): boolean {
  if (isStandalone()) return true;
  try {
    if (sessionStorage.getItem(SESSION_SHOWN_KEY) === '1') return true;
    const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    if (Date.now() - dismissedAt < DISMISS_COOLDOWN_MS) return true;
  } catch {
    // storage unavailable — prefer showing over silently never showing
  }
  return false;
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Only hijack the event when our banner will actually show; otherwise
    // leave Chrome's native install affordance available (e.g. during the
    // dismiss cooldown the omnibox icon keeps working).
    if (suppressed()) return;
    e.preventDefault();
    capturedPrompt = e as BeforeInstallPromptEvent;
    notifyPromptListeners();
  });
  window.addEventListener('appinstalled', () => {
    capturedPrompt = null;
    try {
      localStorage.removeItem(DISMISS_KEY);
    } catch {
      // private mode — nothing to clean
    }
    notifyPromptListeners();
  });
}

export const InstallBanner: React.FC = () => {
  const { t } = useI18n();
  const [promptReady, setPromptReady] = useState(capturedPrompt !== null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onUpdate = () => setPromptReady(capturedPrompt !== null);
    window.addEventListener('appinstalled', onUpdate);
    promptListeners.add(onUpdate);
    return () => {
      window.removeEventListener('appinstalled', onUpdate);
      promptListeners.delete(onUpdate);
    };
  }, []);

  useEffect(() => {
    if (suppressed()) return;
    if (!capturedPrompt && !isIos()) return;

    setVisible(true);
    try {
      sessionStorage.setItem(SESSION_SHOWN_KEY, '1');
    } catch {
      // ignore — the auto-close still bounds the interruption
    }
  }, [promptReady]);

  // Auto-close: the nudge gets one glance per visit, then gets out of the way.
  useEffect(() => {
    if (!visible) return;
    const timer = window.setTimeout(() => setVisible(false), AUTO_CLOSE_MS);
    return () => window.clearTimeout(timer);
  }, [visible]);

  if (!visible) return null;

  const close = (remember: boolean) => {
    setVisible(false);
    if (remember) {
      try {
        localStorage.setItem(DISMISS_KEY, String(Date.now()));
      } catch {
        // ignore — banner simply returns next session
      }
    }
  };

  const install = async () => {
    const promptEvent = capturedPrompt;
    if (!promptEvent) return;
    try {
      await promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;
      capturedPrompt = null;
      // An accepted install removes the banner via `appinstalled`; a
      // dismissed prompt gets the same cooldown as closing the banner.
      close(outcome === 'dismissed');
    } catch {
      close(false);
    }
  };

  return (
    <div
      role="alert"
      className="fixed top-20 left-1/2 -translate-x-1/2 z-[60] w-[92%] max-w-md
        bg-surface-container-high border border-tertiary-container/40 rounded-xl shadow-card
        px-4 py-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <MaterialIcon icon="add_to_home_screen" className="text-[18px] text-tertiary mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="font-label-md text-label-md text-on-surface">{t('install.title')}</p>
            <p className="font-caption text-caption text-on-surface-variant">
              {capturedPrompt ? t('install.body') : t('install.iosHint')}
            </p>
          </div>
        </div>
        <button
          onClick={() => close(true)}
          aria-label={t('common.dismiss')}
          className="shrink-0 text-on-surface-variant"
        >
          <MaterialIcon icon="close" className="text-[18px]" />
        </button>
      </div>
      {capturedPrompt && (
        <button
          onClick={install}
          className="mt-2 w-full h-9 rounded-lg bg-primary-container text-on-primary font-label-md text-label-md flex items-center justify-center gap-1 active-scale-95"
        >
          <MaterialIcon icon="download" className="text-[16px]" />
          {t('install.cta')}
        </button>
      )}
    </div>
  );
};

export default InstallBanner;
