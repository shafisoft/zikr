/**
 * Dumb backend for feedback.
 *
 * Same two uses as the sharedRoom/zikrSync mocks: deterministic unit
 * tests, and running the UI with no Supabase (VITE_SHARED_ROOMS_BACKEND=
 * mock). Accepts every submission into an in-memory list; tests can
 * inspect `submitted` or arm `failNext` to drive the error paths.
 */

import { FeedbackError } from './contract';
import type { FeedbackBackend, FeedbackInput } from './contract';

export class MockFeedbackBackend implements FeedbackBackend {
  readonly name = 'mock';

  /** Everything accepted so far (trimmed by the service before it lands). */
  submitted: FeedbackInput[] = [];
  /** Test hook: the next submit() rejects with this code instead. */
  failNext: FeedbackError['code'] | null = null;

  private counter = 0;

  reset(): void {
    this.submitted = [];
    this.failNext = null;
    this.counter = 0;
  }

  isConfigured(): boolean {
    return true;
  }

  async submit(input: FeedbackInput): Promise<{ id: string }> {
    if (this.failNext) {
      const code = this.failNext;
      this.failNext = null;
      throw new FeedbackError(code);
    }
    this.submitted.push(input);
    return { id: `mock-feedback-${++this.counter}` };
  }
}
