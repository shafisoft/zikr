/**
 * Feedback store — the UI's only door to the feedback service.
 *
 * No liveQuery and no local persistence: feedback is a one-shot remote
 * write, so the store just tracks the in-flight flag and the outcome as
 * an error CODE (translation happens at render — same rule as the other
 * stores). `submitFeedback` resolves `true` on success; failures leave
 * the code in `lastError` for the form to display and clear.
 */

import { create } from 'zustand';
import {
  feedbackService,
  FeedbackError,
  FEEDBACK_CATEGORIES,
  FEEDBACK_MESSAGE_MAX,
} from '../services/feedback';
import type { FeedbackCategory, FeedbackErrorCode, FeedbackInput } from '../services/feedback';

interface FeedbackState {
  submitting: boolean;
  lastError: FeedbackErrorCode | null;
  lastSubmittedId: string | null;
  submitFeedback: (input: FeedbackInput) => Promise<boolean>;
  clearError: () => void;
}

/** Re-exported so the UI can work with codes without importing services. */
export { FeedbackError, FEEDBACK_CATEGORIES, FEEDBACK_MESSAGE_MAX };
export type { FeedbackCategory, FeedbackErrorCode };

export const useFeedbackStore = create<FeedbackState>((set) => ({
  submitting: false,
  lastError: null,
  lastSubmittedId: null,

  submitFeedback: async (input) => {
    set({ submitting: true, lastError: null });
    try {
      const { id } = await feedbackService.submit(input);
      set({ submitting: false, lastSubmittedId: id });
      return true;
    } catch (err) {
      const code = err instanceof FeedbackError ? err.code : 'unknown';
      set({ submitting: false, lastError: code });
      return false;
    }
  },

  clearError: () => set({ lastError: null }),
}));
