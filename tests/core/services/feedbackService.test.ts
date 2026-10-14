import { describe, it, expect, beforeEach } from 'vitest';
import { createFeedbackService } from '../../../src/core/services/feedback/service';
import {
  FeedbackError,
  FEEDBACK_MESSAGE_MAX,
  MockFeedbackBackend,
} from '../../../src/core/services/feedback';
import type { FeedbackBackend, FeedbackInput } from '../../../src/core/services/feedback';

/** Scripted backend double: records what the service hands it. */
function makeRecordingBackend(overrides: Partial<FeedbackBackend> = {}) {
  const received: FeedbackInput[] = [];
  const backend: FeedbackBackend = {
    name: 'test-double',
    isConfigured: () => true,
    submit: async (input) => {
      received.push(input);
      return { id: `server-${received.length}` };
    },
    ...overrides,
  };
  return { backend, received };
}

const validInput: FeedbackInput = {
  category: 'bug',
  message: '  The counter loses my round.  ',
  email: '  me@example.com ',
  appVersion: '1.9.1',
  locale: 'en',
  userAgent: 'vitest',
};

describe('feedbackService.submit', () => {
  it('trims message and email, keeps metadata, returns the backend id', async () => {
    const { backend, received } = makeRecordingBackend();
    const service = createFeedbackService(backend);

    const { id } = await service.submit(validInput);

    expect(id).toBe('server-1');
    expect(received).toHaveLength(1);
    expect(received[0].message).toBe('The counter loses my round.');
    expect(received[0].email).toBe('me@example.com');
    expect(received[0].category).toBe('bug');
    expect(received[0].appVersion).toBe('1.9.1');
    expect(received[0].locale).toBe('en');
    expect(received[0].userAgent).toBe('vitest');
  });

  it('drops an empty optional email after trimming', async () => {
    const { backend, received } = makeRecordingBackend();
    const service = createFeedbackService(backend);

    await service.submit({ ...validInput, email: '   ' });

    expect(received[0].email).toBeUndefined();
  });

  it.each([
    ['whitespace-only message', { ...validInput, message: '   ' }],
    ['overlong message', { ...validInput, message: 'x'.repeat(FEEDBACK_MESSAGE_MAX + 1) }],
    ['unknown category', { ...validInput, category: 'rant' as FeedbackInput['category'] }],
    ['malformed email', { ...validInput, email: 'not-an-email' }],
    ['email without tld', { ...validInput, email: 'a@b' }],
    ['overlong email', { ...validInput, email: `${'a'.repeat(115)}@example.com` }],
  ])('rejects %s with invalid-input', async (_label, bad) => {
    const service = createFeedbackService(makeRecordingBackend().backend);
    await expect(service.submit(bad as FeedbackInput)).rejects.toMatchObject({
      code: 'invalid-input',
    });
  });

  it('surfaces not-configured when the backend has no deployment', async () => {
    const { backend } = makeRecordingBackend({ isConfigured: () => false });
    const service = createFeedbackService(backend);

    await expect(service.submit(validInput)).rejects.toMatchObject({
      code: 'not-configured',
    });
  });

  it('propagates backend FeedbackErrors untouched (captcha failure)', async () => {
    const { backend } = makeRecordingBackend({
      submit: async () => {
        throw new FeedbackError('captcha-failed', 'turnstile error: bad');
      },
    });
    const service = createFeedbackService(backend);

    await expect(service.submit(validInput)).rejects.toMatchObject({
      code: 'captcha-failed',
    });
  });
});

describe('MockFeedbackBackend', () => {
  let mock: MockFeedbackBackend;

  beforeEach(() => {
    mock = new MockFeedbackBackend();
  });

  it('records submissions under stable ids and resets clean', async () => {
    const first = await mock.submit(validInput);
    const second = await mock.submit({ ...validInput, category: 'question' });

    expect(first.id).toBe('mock-feedback-1');
    expect(second.id).toBe('mock-feedback-2');
    expect(mock.submitted.map(s => s.category)).toEqual(['bug', 'question']);

    mock.reset();
    expect(mock.submitted).toEqual([]);
    const after = await mock.submit(validInput);
    expect(after.id).toBe('mock-feedback-1');
  });

  it('fails exactly once when failNext is armed', async () => {
    mock.failNext = 'rate-limited';
    await expect(mock.submit(validInput)).rejects.toMatchObject({ code: 'rate-limited' });
    // One-shot: the following submission succeeds.
    await expect(mock.submit(validInput)).resolves.toMatchObject({ id: 'mock-feedback-1' });
  });
});
