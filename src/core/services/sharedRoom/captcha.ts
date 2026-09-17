/**
 * Cloudflare Turnstile CAPTCHA support for anonymous sign-in.
 *
 * Supabase's captcha protection guards the signup endpoint — which is
 * exactly what `signInAnonymously()` uses — so once captcha is enabled on
 * the project, every sign-in needs a fresh one-time token from the client.
 *
 * The SITE key is public and ships in the bundle (VITE_TURNSTILE_SITE_KEY);
 * the SECRET key belongs in the Supabase dashboard, never in the app.
 * When the env var is absent this module is inert and sign-in proceeds
 * without a token (a project with captcha disabled ignores tokens anyway).
 *
 * Token acquisition is field-polling based: Turnstile writes every solved
 * token into the widget's hidden `.cf-turnstile-response` input, so we
 * consume that field instead of racing the render/callback timing. Tokens
 * are single-use — the field is cleared after hand-off and reset before
 * re-solving.
 */

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const TOKEN_TIMEOUT_MS = 60_000;

interface TurnstileApi {
  render(el: HTMLElement, params: Record<string, unknown>): string;
  reset(id?: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptLoaded: Promise<void> | null = null;
let widgetId: string | null = null;
let widgetHost: HTMLElement | null = null;

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

function currentResponse(): string {
  return (
    widgetHost?.querySelector<HTMLInputElement>('input[name="cf-turnstile-response"], .cf-turnstile-response')
      ?.value ?? ''
  );
}

function clearResponseField(): void {
  const input = widgetHost?.querySelector<HTMLInputElement>('input[name="cf-turnstile-response"]');
  if (input) input.value = '';
}

function ensureWidget(): string {
  if (widgetId !== null) return widgetId;

  const host = document.createElement('div');
  // Visible enough for Turnstile to run when it demands interaction. Parked
  // ABOVE the bottom tab bar (~64px) and at a z-index above page modals
  // (z-50), so the challenge is reachable even when sign-in is re-attempted
  // from inside the create-group modal.
  host.style.cssText = 'position:fixed;left:12px;bottom:84px;z-index:70;';
  document.body.appendChild(host);
  widgetHost = host;

  widgetId = window.turnstile!.render(host, {
    sitekey: SITE_KEY,
    // Keeps the widget out of sight unless interaction is required.
    appearance: 'interaction-only',
    action: 'signup',
  });
  return widgetId;
}

/**
 * One token per call: consume the auto-solved token when present, otherwise
 * reset (re-solve) and poll the response field until Turnstile fills it.
 * Deterministic — no dependence on callback ordering.
 */
export async function getCaptchaToken(): Promise<string> {
  await loadTurnstileScript();
  ensureWidget();

  const existing = currentResponse();
  if (existing) {
    clearResponseField();
    return existing;
  }

  window.turnstile!.reset(widgetId!);
  const deadline = Date.now() + TOKEN_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 250));
    const token = currentResponse();
    if (token) {
      clearResponseField();
      return token;
    }
  }
  throw new Error('captcha token timeout');
}
