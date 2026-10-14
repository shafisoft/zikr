/**
 * Feedback error presentation — lives in ui because it produces
 * translation keys; the store only ever holds error CODES.
 */

import type { FeedbackErrorCode } from '../../core/stores/feedbackStore';

/** Translation key for a feedback failure — rendered with `t()` by the form. */
export function feedbackErrorKey(code: FeedbackErrorCode | 'unknown'): string {
  switch (code) {
    case 'invalid-input':
      return 'feedback.errorInvalid';
    case 'rate-limited':
      return 'feedback.errorRateLimited';
    case 'network':
      return 'feedback.errorNetwork';
    case 'not-configured':
      return 'feedback.errorNotConfigured';
    case 'captcha-failed':
      return 'errors.captcha-failed';
    case 'not-authenticated':
      return 'errors.not-authenticated';
    default:
      return 'errors.unknown';
  }
}
