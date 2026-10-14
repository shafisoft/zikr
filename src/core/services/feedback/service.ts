/**
 * Feedback Service — thin validation gate over the backend port.
 *
 * The form already validates field-by-field for inline UX; this repeats
 * the checks as the single authority (trimmed values, category whitelist,
 * bounds) so no caller can bypass them. There is deliberately no local
 * persistence and no retry: feedback is one user-visible action, errors
 * surface to the user as codes, and the server rate-limits repetition.
 */

import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_EMAIL_MAX,
  FEEDBACK_MESSAGE_MAX,
  FeedbackError,
} from './contract';
import type { FeedbackBackend, FeedbackInput } from './contract';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function createFeedbackService(backend: FeedbackBackend) {
  return {
    readonlyBackendName: backend.name,

    /** Whether the backend has everything it needs to operate. */
    isConfigured(): boolean {
      return backend.isConfigured();
    },

    async submit(input: FeedbackInput): Promise<{ id: string }> {
      const category = input.category;
      if (!FEEDBACK_CATEGORIES.includes(category)) {
        throw new FeedbackError('invalid-input', 'unknown category');
      }

      const message = input.message.trim();
      if (!message || message.length > FEEDBACK_MESSAGE_MAX) {
        throw new FeedbackError('invalid-input', 'message must be 1..2000 chars');
      }

      const email = input.email?.trim();
      if (email && (email.length > FEEDBACK_EMAIL_MAX || !EMAIL_RE.test(email))) {
        throw new FeedbackError('invalid-input', 'malformed email');
      }

      if (!backend.isConfigured()) {
        throw new FeedbackError('not-configured');
      }

      return backend.submit({
        ...input,
        message,
        email: email || undefined,
      });
    },
  };
}

export type FeedbackService = ReturnType<typeof createFeedbackService>;
