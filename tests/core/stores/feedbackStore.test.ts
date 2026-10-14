import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useFeedbackStore } from '../../../src/core/stores/feedbackStore';
import type { FeedbackInput } from '../../../src/core/services/feedback';

// The store singleton binds the env-selected backend at import time; the
// test swaps the whole feedback module for a scripted service so no test
// can reach the network.
const { submitMock, FeedbackError } = vi.hoisted(() => {
  class FeedbackError extends Error {
    code: string;
    constructor(code: string, message?: string) {
      super(message || code);
      this.name = 'FeedbackError';
      this.code = code;
    }
  }
  return { submitMock: vi.fn(), FeedbackError };
});

vi.mock('../../../src/core/services/feedback', () => ({
  feedbackService: { submit: submitMock },
  FeedbackError,
  FEEDBACK_CATEGORIES: ['bug', 'suggestion', 'question', 'other'],
  FEEDBACK_MESSAGE_MAX: 2000,
}));

const input: FeedbackInput = { category: 'bug', message: 'something broke' };

function resetStore() {
  useFeedbackStore.setState({ submitting: false, lastError: null, lastSubmittedId: null });
}

describe('feedbackStore.submitFeedback', () => {
  beforeEach(() => {
    resetStore();
    submitMock.mockReset();
  });

  it('returns true, records the id, and leaves no error on success', async () => {
    submitMock.mockResolvedValue({ id: 'server-9' });

    const ok = await useFeedbackStore.getState().submitFeedback(input);

    expect(ok).toBe(true);
    expect(submitMock).toHaveBeenCalledWith(input);
    const state = useFeedbackStore.getState();
    expect(state.lastSubmittedId).toBe('server-9');
    expect(state.lastError).toBeNull();
    expect(state.submitting).toBe(false);
  });

  it('maps a FeedbackError to its code and returns false', async () => {
    submitMock.mockRejectedValue(new FeedbackError('rate-limited'));

    const ok = await useFeedbackStore.getState().submitFeedback(input);

    expect(ok).toBe(false);
    expect(useFeedbackStore.getState().lastError).toBe('rate-limited');
    expect(useFeedbackStore.getState().lastSubmittedId).toBeNull();
    expect(useFeedbackStore.getState().submitting).toBe(false);
  });

  it('maps non-FeedbackError failures to unknown', async () => {
    submitMock.mockRejectedValue(new Error('fetch exploded'));

    const ok = await useFeedbackStore.getState().submitFeedback(input);

    expect(ok).toBe(false);
    expect(useFeedbackStore.getState().lastError).toBe('unknown');
  });

  it('clearError resets the held code', async () => {
    submitMock.mockRejectedValue(new FeedbackError('captcha-failed'));
    await useFeedbackStore.getState().submitFeedback(input);
    expect(useFeedbackStore.getState().lastError).toBe('captcha-failed');

    useFeedbackStore.getState().clearError();
    expect(useFeedbackStore.getState().lastError).toBeNull();
  });
});
