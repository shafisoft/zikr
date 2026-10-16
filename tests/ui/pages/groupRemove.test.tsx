// Group page long-press removal — the list-cleanup path for old groups:
//   * press-and-hold a group card opens the danger confirm (a plain tap
//     must never open it — tap still means "open the group");
//   * the confirm copy matches the caller's stake: a MEMBER is told they
//     leave the group, the OWNER of an active group is told it is their
//     list only (members keep the group, the code rejoins);
//   * confirming removes the group from the store list via the leave flow.
// The store is seeded directly (no backend in tests); the service's
// leaveRoom is spied at the service seam like counterSession does.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

import Group from '../../../src/ui/pages/Group';
import { useSharedRoomStore } from '../../../src/core/stores/sharedRoomStore';
import { sharedRoomService } from '../../../src/core/services/sharedRoom';
import { SharedRoom } from '../../../src/core/db/types';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function waitForDom(cond: () => boolean, ms = 2000) {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('waitForDom: condition not met in time');
    await sleep(25);
  }
}

const HOLD_MS = 500; // useLongPress default — the production duration

function room(code: string, title: string, ownerId: string, status: SharedRoom['status']): SharedRoom {
  return {
    code,
    id: `srv-${code}`,
    title,
    ownerId,
    status,
    joinedAt: new Date(),
    fetchedAt: new Date(),
  };
}

const MEMBER_ACTIVE = room('ABC123', 'Family Khatma', 'user-2', 'active');
const OWNER_CLOSED = room('OLD999', 'Ramadan Circle', 'user-1', 'closed');
const OWNER_ACTIVE = room('LIVE777', 'Daily Khatma', 'user-1', 'active');

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let leaveSpy: ReturnType<typeof vi.spyOn>;

async function renderPage() {
  if (root) {
    root.unmount();
    root = null;
    container?.remove();
  }
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  root.render(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(Group)
    )
  );
  await sleep(10);
}

function pointer(type: string): PointerEvent {
  return new PointerEvent(type, { bubbles: true, cancelable: true, clientX: 10, clientY: 10 });
}

function cardByTitle(title: string): HTMLButtonElement {
  const cards = Array.from(container?.querySelectorAll('button') ?? []);
  const card = cards.find(b => b.textContent?.includes(title));
  if (!card) throw new Error(`card "${title}" not mounted`);
  return card;
}

function buttonByText(text: string): HTMLButtonElement | null {
  const buttons = Array.from(container?.querySelectorAll('button') ?? []);
  return buttons.find(b => b.textContent?.trim() === text) ?? null;
}

async function longPressAndConfirm(card: HTMLButtonElement) {
  card.dispatchEvent(pointer('pointerdown'));
  // Self-healing wait: the dialog opens the moment the hold passes 500ms,
  // whenever that lands on a loaded runner.
  await waitForDom(() => buttonByText('Remove') != null);
  card.dispatchEvent(pointer('pointerup'));
  card.dispatchEvent(pointer('click'));
}

beforeEach(() => {
  leaveSpy = vi.spyOn(sharedRoomService, 'leaveRoom').mockResolvedValue(undefined);
  // No backend in tests: neutralize init and seed the list directly.
  useSharedRoomStore.setState({
    initialized: true,
    configured: true,
    identity: { userId: 'user-1', displayName: 'Tester', createdAt: new Date() },
    rooms: [MEMBER_ACTIVE, OWNER_CLOSED, OWNER_ACTIVE],
    plans: [],
    error: null,
    init: async () => {},
  });
});

afterEach(() => {
  root?.unmount();
  root = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
  useSharedRoomStore.setState({ rooms: [], plans: [], identity: null });
});

describe('Group page long-press removal', () => {
  it('a member removing an active group is told they leave it', async () => {
    await renderPage();

    await longPressAndConfirm(cardByTitle('Family Khatma'));

    expect(container!.textContent).toContain('leave "Family Khatma"');

    buttonByText('Remove')?.click();
    await waitForDom(() => buttonByText('Remove') == null);

    expect(leaveSpy).toHaveBeenCalledWith('ABC123');
    expect(useSharedRoomStore.getState().rooms.map(r => r.code).sort()).toEqual([
      'LIVE777',
      'OLD999',
    ]);
    expect(container!.textContent).not.toContain('Family Khatma');
  });

  // The owner copy exists for the ACTIVE case only — there the stakes
  // differ (the group lives on for members). A closed group is read-only
  // history, so the plain leave copy is honest for its owner too.
  it('the owner of a closed group gets the plain leave copy', async () => {
    await renderPage();

    await longPressAndConfirm(cardByTitle('Ramadan Circle'));

    expect(container!.textContent).toContain('leave "Ramadan Circle"');

    buttonByText('Remove')?.click();
    await waitForDom(() => buttonByText('Remove') == null);

    expect(leaveSpy).toHaveBeenCalledWith('OLD999');
    expect(useSharedRoomStore.getState().rooms.map(r => r.code).sort()).toEqual([
      'ABC123',
      'LIVE777',
    ]);
  });

  it('the owner of an active group is told it is their list only', async () => {
    await renderPage();

    await longPressAndConfirm(cardByTitle('Daily Khatma'));

    expect(container!.textContent).toContain('from your list only');
    expect(container!.textContent).toContain('Daily Khatma');

    buttonByText('Remove')?.click();
    await waitForDom(() => buttonByText('Remove') == null);

    expect(leaveSpy).toHaveBeenCalledWith('LIVE777');
    expect(useSharedRoomStore.getState().rooms.map(r => r.code).sort()).toEqual([
      'ABC123',
      'OLD999',
    ]);
  });

  it('a plain tap never opens the removal dialog', async () => {
    await renderPage();

    cardByTitle('Family Khatma').dispatchEvent(pointer('pointerdown'));
    await sleep(5);
    cardByTitle('Family Khatma').dispatchEvent(pointer('pointerup'));
    cardByTitle('Family Khatma').dispatchEvent(pointer('click'));
    await sleep(HOLD_MS + 200);

    expect(buttonByText('Remove')).toBeNull();
    expect(leaveSpy).not.toHaveBeenCalled();
  });
});
