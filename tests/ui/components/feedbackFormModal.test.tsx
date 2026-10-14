// FeedbackFormModal — draft state, inline validation, the store-error line,
// and the success phase. Presentational: submission state, error codes, and
// success arrive via props, so no store or backend is involved here.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { createRoot, Root } from 'react-dom/client';

import FeedbackFormModal from '../../../src/ui/components/FeedbackFormModal';
import type { FeedbackDraft } from '../../../src/ui/components/FeedbackFormModal';
import type { FeedbackErrorCode } from '../../../src/core/stores/feedbackStore';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  submitting: boolean;
  error: FeedbackErrorCode | null;
  success: boolean;
  onSubmit: (draft: FeedbackDraft) => void;
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let props: ModalProps;
let submitted: FeedbackDraft[] | null;

async function render(overrides: Partial<ModalProps> = {}) {
  if (root) {
    root.unmount();
    root = null;
    container?.remove();
  }
  container = document.createElement('div');
  document.body.appendChild(container);
  props = {
    isOpen: true,
    onClose: () => {},
    submitting: false,
    error: null,
    success: false,
    onSubmit: draft => {
      submitted!.push(draft);
    },
    ...overrides,
  };
  submitted = [];
  root = createRoot(container);
  root.render(React.createElement(FeedbackFormModal, props, null));
  await sleep(20);
}

function buttonByText(text: string): HTMLButtonElement | null {
  return (
    ([...container!.querySelectorAll('button')] as HTMLButtonElement[]).find(
      b => b.textContent?.includes(text)
    ) ?? null
  );
}

function sendButton(): HTMLButtonElement | null {
  // "Send" (idle) and "Sending…" (in flight) both contain the stem.
  return buttonByText('Send');
}

/** Poll until `cond` holds — a fixed sleep never survives loaded CI. */
async function waitFor(cond: () => boolean, ms = 2000) {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('waitFor: condition not met in time');
    await sleep(10);
  }
}

function setMessage(value: string) {
  const el = container!.querySelector('#feedback-message') as HTMLTextAreaElement;
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    'value'
  )!.set!;
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function setEmail(value: string) {
  const el = container!.querySelector('#feedback-email') as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  )!.set!;
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('FeedbackFormModal', () => {
  it('renders nothing while closed', async () => {
    await render({ isOpen: false });
    expect(container!.querySelector('[role="dialog"]')).toBeNull();
  });

  it('starts with Bug selected and Send disabled until a message exists', async () => {
    await render({});
    expect(buttonByText('Bug')!.getAttribute('class')).toContain('bg-primary-container');
    expect(sendButton()!.disabled).toBe(true);

    setMessage('The night preset lost my count');
    await waitFor(() => sendButton()?.disabled === false);
    expect(sendButton()!.disabled).toBe(false);
  });

  it('keeps Send disabled for an empty message, so onSubmit is unreachable', async () => {
    await render({});
    // The button is disabled — a click is a no-op, no error line needed.
    expect(sendButton()!.disabled).toBe(true);
    sendButton()!.click();
    await sleep(10);

    expect(submitted).toEqual([]);
  });

  it('submits the raw draft; trimming is the service\'s job', async () => {
    await render({});
    buttonByText('Suggestion')!.click();
    setMessage('  Add a Bengali translation for the adhkar  ');
    setEmail('me@example.com');
    await waitFor(() => sendButton()?.disabled === false);

    sendButton()!.click();
    await sleep(10);

    expect(submitted).toEqual([
      {
        category: 'suggestion',
        message: '  Add a Bengali translation for the adhkar  ',
        email: 'me@example.com',
      },
    ]);
  });

  it('renders the mapped store error line (rate-limited)', async () => {
    await render({ error: 'rate-limited' });
    expect(container!.querySelector('[role="alert"]')!.textContent).toBe(
      'You have sent several messages recently. Please try again tomorrow.'
    );
  });

  it('disables interactions while submitting', async () => {
    await render({ submitting: true, error: 'network' });
    expect(sendButton()!.disabled).toBe(true);
    // The send button shows the spinner + "Sending…" label.
    expect(sendButton()!.textContent).toContain('Sending…');
  });

  it('success phase shows the thank-you card and Done closes', async () => {
    const onClose = vi.fn();
    await render({ success: true, onClose });

    expect(container!.textContent).toContain('Feedback sent');
    expect(container!.textContent).toContain('Thank you! Your message reached us.');
    expect(sendButton()).toBeNull();

    buttonByText('Done')!.click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
