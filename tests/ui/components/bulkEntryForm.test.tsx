// BulkEntryForm — the prayer-anchored part-of-day selector (fix: a manual
// entry declares WHICH practice it was, so a Fajr entry never completes the
// evening preset's shared items). Runs against the real stores +
// fake-indexeddb.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import React from 'react';
import { createRoot, Root } from 'react-dom/client';

import BulkEntryForm from '../../../src/ui/components/BulkEntryForm';
import { db } from '../../../src/core/db/db';
import { useZikrStore } from '../../../src/core/stores/zikrStore';
import { useSessionStore } from '../../../src/core/stores/sessionStore';
import { useSettingsStore } from '../../../src/core/stores/settingsStore';
import { DEFAULT_PRAYER_FOR_PART, dayPartOfTime, PRAYER_DAY_PART } from '../../../src/core/utils/routineUtils';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function waitFor(cond: () => boolean | Promise<boolean>, ms = 4000) {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('condition not met in time');
    await sleep(25);
  }
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

async function renderForm() {
  if (root) {
    root.unmount();
    root = null;
    container?.remove();
  }
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  root.render(React.createElement(BulkEntryForm));
  // Entries initialise from the zikr store in an effect.
  await waitFor(() => container!.querySelector('input[type="number"]') !== null);
}

function buttonByText(text: string): HTMLButtonElement | null {
  // MaterialIcon renders the icon ligature inside the button, so match by
  // containment (the chips' labels stay unambiguous).
  return (
    ([...container!.querySelectorAll('button')] as HTMLButtonElement[]).find(
      b => b.textContent?.includes(text)
    ) ?? null
  );
}

function setInputValue(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  )!.set!;
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

beforeEach(async () => {
  await db.delete();
  await db.open();
  useZikrStore.setState({
    zikrs: [{ id: 1, name: 'SubhanAllah', custom: false, createdAt: new Date() }],
    loading: false,
  });
  useSessionStore.setState({ sessions: [], loading: false });
  useSettingsStore.setState({ settings: {}, loading: false });
  vi.restoreAllMocks();
});

describe('BulkEntryForm — part-of-day selector', () => {
  it('offers the five prayers + Night, preselected from the clock', async () => {
    await renderForm();
    for (const choice of Object.keys(PRAYER_DAY_PART)) {
      const label = choice === 'night' ? 'Night' : choice.charAt(0).toUpperCase() + choice.slice(1);
      expect(buttonByText(label)).not.toBeNull();
    }
    const checked = container!.querySelector('[role="radio"][aria-checked="true"]');
    expect(checked?.textContent).toBe(
      // The clock-derived default, rendered through the same label map.
      cap(DEFAULT_PRAYER_FOR_PART[dayPartOfTime(new Date())])
    );
  });

  it('stores the mapped part: a Fajr entry saves dayPart "morning"', async () => {
    await renderForm();
    setInputValue(container!.querySelector('input[type="number"]')!, '33');
    buttonByText('Fajr')!.click();
    await sleep(50); // let React flush the choice before saving
    // Save: the success dialog has no host in this test — poll the DB.
    buttonByText('Save 1 Session')!.click();
    await waitFor(async () => (await db.sessions.count()) === 1);
    const session = (await db.sessions.toArray())[0];
    expect(session.dayPart).toBe('morning');
    expect(session.source).toBe('manual');
    expect(session.count).toBe(33);
  });

  it('an Isha entry saves dayPart "evening"', async () => {
    await renderForm();
    setInputValue(container!.querySelector('input[type="number"]')!, '10');
    buttonByText('Isha')!.click();
    await sleep(50);
    buttonByText('Save 1 Session')!.click();
    await waitFor(async () => (await db.sessions.count()) === 1);
    expect((await db.sessions.toArray())[0].dayPart).toBe('evening');
  });
});

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
