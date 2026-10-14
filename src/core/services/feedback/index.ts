/**
 * Feedback — public surface.
 *
 * The app (stores) imports from this module only. Concrete backends live
 * behind the FeedbackBackend contract (see ./contract.ts):
 *   - supabaseBackend.ts — production adapter (captcha-aware)
 *   - mockBackend.ts     — dumb in-memory backend for tests / offline demos
 */

export { FeedbackError } from './contract';
export type {
  FeedbackErrorCode,
  FeedbackBackend,
  FeedbackCategory,
  FeedbackInput,
} from './contract';
export { FEEDBACK_CATEGORIES, FEEDBACK_MESSAGE_MAX, FEEDBACK_EMAIL_MAX } from './contract';
export { createFeedbackService } from './service';
export type { FeedbackService } from './service';
export { SupabaseFeedbackBackend } from './supabaseBackend';
export { MockFeedbackBackend } from './mockBackend';
export { createFeedbackBackend } from './backendFactory';
export { feedbackService, default } from './instance';
