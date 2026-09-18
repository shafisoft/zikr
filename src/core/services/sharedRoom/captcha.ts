/**
 * Cloudflare Turnstile CAPTCHA for Supabase anonymous sign-in.
 *
 * Follows the official integration pattern (supabase.com/docs/guides/auth/auth-captcha,
 * Turnstile): a FRESH widget renders VISIBLE at each sign-in attempt and the
 * token arrives through the widget's `callback`. It is deliberately NOT a
 * long-lived hidden widget with a polled response field — Turnstile tokens
 * are single-use and expire in ~5 minutes, so parked tokens fail
 * verification as stale.
 *
 * The SITE key is public and ships in the bundle (VITE_TURNSTILE_SITE_KEY);
 * the SECRET key belongs in the Supabase dashboard, never in the app.
 * When the env var is absent this module is inert and sign-in proceeds
 * without a token (a project with captcha disabled ignores tokens anyway).
 */

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
// Long enough for a human to notice the visible widget and solve it; the
// widget's own error/timeout callbacks usually settle things sooner.
const TOKEN_TIMEOUT_MS = 120_000;

interface TurnstileRenderParams {
  sitekey: string;
  appearance?: 'always' | 'execute' | 'interaction-only';
  callback: (token: string) => void;
  'error-callback'?: (code: string) => void;
  'expired-callback'?: () => void;
  'timeout-callback'?: () => void;
}

interface TurnstileApi {
  render(el: HTMLElement, params: TurnstileRenderParams): string;
  remove(id: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptLoaded: Promise<void> | null = null;

export function isCaptchaEnabled(): boolean {
  return Boolean(SITE_KEY);
}

function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (scriptLoaded) return scriptLoaded;

  scriptLoaded = new Promise<void>((resolve, reject) => {
    const el = document.createElement('script');
    el.src = SCRIPT_SRC;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => {
      scriptLoaded = null;
      reject(new Error('failed to load turnstile script'));
    };
    document.head.appendChild(el);
  });
  return scriptLoaded;
}

/**
 * One visible, one-use widget per call. Renders a small themed card, resolves
 * with the token through the widget's `callback`, and removes the widget —
 * no token is ever parked or reused across attempts.
 *
 * Concurrent callers share the in-flight attempt (one widget, one token):
 * a second card popping over the first would be nonsense.
 */
let pendingToken: Promise<string> | null = null;

export function getCaptchaToken(): Promise<string> {
  if (!pendingToken) {
    pendingToken = renderAndCapture().finally(() => {
      pendingToken = null;
    });
  }
  return pendingToken;
}

async function renderAndCapture(): Promise<string> {
  await loadTurnstileScript();

  return new Promise<string>((resolve, reject) => {
    const host = document.createElement('div');
    host.innerHTML = `
      <div class="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
        <div class="relative bg-surface rounded-2xl shadow-xl border border-outline-variant/20 p-5 w-full max-w-sm">
          <p class="font-label-md text-label-md text-primary mb-1 flex items-center gap-2">
            <span class="material-symbols-outlined text-[18px] text-tertiary">shield</span>
            Security check
          </p>
          <p class="font-caption text-caption text-on-surface-variant mb-3 flex items-center gap-2" data-verifying>
            <span class="inline-block w-3.5 h-3.5 border-2 border-tertiary border-t-transparent rounded-full animate-spin shrink-0"></span>
            Verifying your browser — this takes just a moment…
          </p>
          <div data-widget-mount></div>
          <button data-cancel class="mt-3 h-touch-target-min w-full rounded-xl border border-outline-variant/40 text-on-surface-variant font-label-md text-label-md hover:bg-surface-container transition-colors">
            Cancel
          </button>
        </div>
      </div>`;
    document.body.appendChild(host);

    const mount = host.querySelector<HTMLElement>('[data-widget-mount]')!;
    let widgetId: string | null = null;
    let settled = false;

    const cleanup = () => {
      window.clearTimeout(deadline);
      if (widgetId !== null) {
        try {
          window.turnstile!.remove(widgetId);
        } catch {
          // widget already gone — nothing to clean
        }
      }
      host.remove();
    };
    const finish = (settle: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      settle();
    };

    const cancelBtn = host.querySelector<HTMLButtonElement>('[data-cancel]')!;
    cancelBtn.onclick = () => finish(() => reject(new Error('captcha cancelled')));

    const deadline = window.setTimeout(() => {
      finish(() => reject(new Error('captcha token timeout')));
    }, TOKEN_TIMEOUT_MS);

    widgetId = window.turnstile!.render(mount, {
      sitekey: SITE_KEY!,
      // Happy path stays invisible: passive verification never shows the
      // widget, so the card reads as a brief "verifying" moment. When
      // Cloudflare demands interaction, the checkbox appears in the mount
      // below the spinner — visible, in context, solvable. Appearance only
      // controls visibility, never the pass/fail decision.
      appearance: 'interaction-only',
      callback: (token) => finish(() => resolve(token)),
      'error-callback': (code) => finish(() => reject(new Error(`turnstile error: ${code}`))),
      'expired-callback': () => finish(() => reject(new Error('captcha token expired'))),
    });
  });
}
