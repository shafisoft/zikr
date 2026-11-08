// TodayHeroContainer — the unified day hero (Noor 2.0 phase 1):
//   - carries the day total ("You've done N dhikr today"), the plan ring
//     (percent = planRingProgress), a pace line against the recent daily
//     rhythm, and one chip per countable plan (personal + mirrored group)
//   - a chip tap bubbles onOpenPlans
//   - the pace line hides while there is no rhythm yet (average 0)
//   - renders nothing on a brand-new day with no plans and no history
// Real stores over fake-indexeddb; sessions seeded relative to the real
// clock (the metrics read getToday()).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import React from 'react';
import { createRoot, Root } from 'react-dom/client';

import TodayHeroContainer from '../../../src/ui/containers/today/TodayHeroContainer';
import { useSessionStore } from '../../../src/core/stores/sessionStore';
import { usePlanStore } from '../../../src/core/stores/planStore';
import { useSharedRoomStore } from '../../../src/core/stores/sharedRoomStore';
import type { Plan, Session } from '../../../src/core/db/types';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function waitForDom(cond: () => boolean, ms = 2000) {
  const start = performance.now();
  while (!cond()) {
    if (performance.now() - start > ms) throw new Error('waitForDom: condition not met in time');
    await sleep(25);
  }
}

function daysFromNow(offset: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(12, 0, 0, 0);
  return d;
}

function sessionOn(offsetDays: number, count: number, zikrId = 1): Session {
  const date = daysFromNow(offsetDays);
  const midnight = new Date(date);
  midnight.setHours(0, 0, 0, 0);
  return {
    id: offsetDays * 10 + zikrId,
    zikrId,
    count,
    source: 'app',
    timestamp: date,
    date: midnight,
    editableUntil: date,
    createdAt: date,
    updatedAt: date,
  };
}

function plan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: 'p1',
    mode: 'combined',
    period: 'one-time',
    target: 200,
    zikrs: [{ name: 'SubhanAllah', zikrId: 1 }],
    startDate: daysFromNow(-7),
    endDate: daysFromNow(7),
    status: 'active',
    createdAt: new Date(),
    ...overrides,
  };
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let opened = false;
const onOpenPlans = () => {
  opened = true;
};

function renderHero() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  root.render(React.createElement(TodayHeroContainer, { onOpenPlans }));
  return sleep(50);
}

function buttonByAria(label: string): HTMLButtonElement | null {
  return (
    ([...container!.querySelectorAll('button')] as HTMLButtonElement[]).find(
      b => b.getAttribute('aria-label') === label
    ) ?? null
  );
}

beforeEach(() => {
  opened = false;
  useSessionStore.setState({ sessions: [], loading: false });
  usePlanStore.setState({ plans: [], loading: false });
  useSharedRoomStore.setState({ plans: [], rooms: [], initialized: true });
});

afterEach(() => {
  if (root) {
    root.unmount();
    root = null;
  }
  container?.remove();
  container = null;
});

describe('TodayHeroContainer', () => {
  it('shows the day total, the plan ring and a personal chip; a chip opens Plans', async () => {
    useSessionStore.setState({
      sessions: [sessionOn(0, 100), sessionOn(-1, 50), sessionOn(-2, 50)],
      loading: false,
    });
    usePlanStore.setState({ plans: [plan()], loading: false });

    await renderHero();
    await waitForDom(() => container!.textContent!.includes("You've done 100 dhikr today"));

    // 100 today vs the 50/day rhythm → ahead; the plan ring reads 100/200.
    expect(container!.textContent).toContain('Ahead of your weekly rhythm');
    expect(container!.textContent).toContain('Daily plan');
    expect(container!.textContent).toContain('50%');
    expect(container!.textContent).toContain('SubhanAllah');

    const chip = buttonByAria('Open SubhanAllah in Plans');
    expect(chip).not.toBeNull();
    chip!.click();
    expect(opened).toBe(true);
  });

  it('group plans render as chips with the mirror percent', async () => {
    const group = plan({
      id: 'g1',
      title: 'Group khatma',
      mode: 'per-zikr',
      period: 'monthly',
      timeZone: 'UTC',
      roomCode: 'AB12',
      target: undefined,
      zikrs: [{ name: 'Ya Mufattih', target: 200, periodTotal: 50, total: 900 }],
    });
    useSessionStore.setState({ sessions: [sessionOn(0, 10)], loading: false });
    useSharedRoomStore.setState({ plans: [group], rooms: [], initialized: true });

    await renderHero();
    await waitForDom(() => container!.textContent!.includes('Group khatma'));
    expect(buttonByAria('Open Group khatma in Plans')).not.toBeNull();
    expect(container!.textContent).toContain('25%');
  });

  it('hides the pace line while there is no rhythm yet', async () => {
    useSessionStore.setState({ sessions: [sessionOn(0, 100)], loading: false });
    usePlanStore.setState({ plans: [plan()], loading: false });

    await renderHero();
    await waitForDom(() => container!.textContent!.includes("You've done 100 dhikr today"));
    expect(container!.textContent).not.toContain('weekly rhythm');
  });

  it('renders nothing on a brand-new day with no plans and no history', async () => {
    await renderHero();
    await sleep(30);
    expect(container!.textContent!.trim()).toBe('');
  });
});
