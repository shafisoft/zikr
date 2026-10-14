/**
 * Feedback — backend contract (the port).
 *
 * Same port/adapter shape as sharedRoom/zikrSync: the app knows only this
 * file; concrete backends (Supabase adapter, mock) implement it. Feedback
 * is fire-and-forget: one submit per user action, no local persistence and
 * no pull — the server table is read only by the admin in the dashboard.
 *
 * Captcha: the Supabase adapter attaches a fresh Cloudflare Turnstile
 * token per submission (the sharedRoom captcha module owns the widget
 * UX); the mock needs none. The port stays captcha-agnostic.
 */

// ---------- Payload shapes ----------

export type FeedbackCategory = 'bug' | 'suggestion' | 'question' | 'other';

/** Order defines the category chips in the form. */
export const FEEDBACK_CATEGORIES: FeedbackCategory[] = [
  'bug',
  'suggestion',
  'question',
  'other',
];

export const FEEDBACK_MESSAGE_MAX = 2000;
export const FEEDBACK_EMAIL_MAX = 120;

export interface FeedbackInput {
  category: FeedbackCategory;
  message: string;
  /** Optional reply channel — the only way the admin can answer back. */
  email?: string;
  appVersion?: string;
  locale?: string;
  userAgent?: string;
}

// ---------- Error taxonomy ----------

export type FeedbackErrorCode =
  | 'not-configured'
  | 'not-authenticated'
  | 'captcha-failed'
  | 'rate-limited'
  | 'invalid-input'
  | 'network'
  | 'unknown';

export class FeedbackError extends Error {
  readonly code: FeedbackErrorCode;

  constructor(code: FeedbackErrorCode, message?: string) {
    super(message || code);
    this.name = 'FeedbackError';
    this.code = code;
  }
}

// ---------- The port ----------

export interface FeedbackBackend {
  /** Human-readable backend name (diagnostics). */
  readonly name: string;

  /** Whether the backend has everything it needs to operate. */
  isConfigured(): boolean;

  /**
   * Submit one feedback message. The server attributes it to the caller
   * (anonymous identity), verifies the captcha when the deployment has
   * one configured, and rate-limits per user — rejections arrive as
   * FeedbackErrors with the matching code.
   */
  submit(input: FeedbackInput): Promise<{ id: string }>;
}
