// StreakArch (Noor 2.0 phase 3) — the Progress mihrab, presentational:
//   - the streak number and the glow arc share one story
//   - grace mode shows the held line (never guilt), fresh-break the
//     fresh-start line
//   - the 30-day strip renders one dot per day with its state, hidden
//     while there is no history at all
//   - the lifetime total sits at the arch's foot
import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import StreakArch from '../../../src/ui/components/progress/StreakArch';
import type { PracticeDay, StreakStatus } from '../../../src/core/utils/overallStreak';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function dayState(state: PracticeDay['state']): PracticeDay {
  return { date: '2026-11-08', state };
}

function renderArch(props: {
  streak: StreakStatus;
  days: PracticeDay[];
  lifetimeTotal?: number;
  showDots?: boolean;
}) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  root.render(
    React.createElement(StreakArch, {
      streak: props.streak,
      days: props.days,
      lifetimeTotal: props.lifetimeTotal ?? 128540,
      showDots: props.showDots ?? true,
    })
  );
  return sleep(0);
}

afterEach(() => {
  if (root) {
    root.unmount();
    root = null;
  }
  container?.remove();
  container = null;
});

describe('StreakArch', () => {
  it('shows the streak number and one dot per day', async () => {
    const days: PracticeDay[] = [
      ...Array.from({ length: 5 }, () => dayState('done')),
      dayState('grace'),
      ...Array.from({ length: 3 }, () => dayState('missed')),
      dayState('pending'),
    ];
    await renderArch({ streak: { value: 7, mode: 'grace' }, days });

    expect(container!.textContent).toContain('7');
    // The grace story is held, not guilted.
    expect(container!.textContent).toContain('Your streak is safe — pick up right where you left off.');
    const strip = container!.querySelector('[data-state]');
    expect(strip).not.toBeNull();
    const dots = container!.querySelectorAll('[data-state]');
    expect(dots.length).toBe(10);
    expect(container!.querySelectorAll('[data-state="done"]').length).toBe(5);
    expect(container!.querySelectorAll('[data-state="grace"]').length).toBe(1);
    expect(container!.querySelectorAll('[data-state="missed"]').length).toBe(3);
    expect(container!.querySelectorAll('[data-state="pending"]').length).toBe(1);
    // Lifetime total in gold at the foot.
    expect(container!.textContent).toContain('128,540');
  });

  it('a fresh break reads as an honest zero with the fresh-start line', async () => {
    await renderArch({
      streak: { value: 0, mode: 'fresh-break' },
      days: Array.from({ length: 30 }, () => dayState('missed')),
    });
    expect(container!.textContent).toContain('A fresh streak starts today.');
  });

  it('hides the strip while there is no history at all', async () => {
    await renderArch({
      streak: { value: 0, mode: 'normal' },
      days: Array.from({ length: 30 }, () => dayState('pending')),
      showDots: false,
    });
    expect(container!.querySelector('[data-state]')).toBeNull();
  });
});
