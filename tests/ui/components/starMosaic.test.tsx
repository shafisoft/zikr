// StarMosaic (Noor 2.0 phase 4) — the Circle's communal fill as khatam
// stars: full stars under the percent, the star being earned in gold
// ("hot"), the rest empty. Render only.
import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import StarMosaic from '../../../src/ui/components/progress/StarMosaic';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function renderMosaic(percent: number, tiles = 8) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  root.render(
    React.createElement(StarMosaic, { percent, tiles, ariaLabel: 'Collective progress: 50 percent' })
  );
  return sleep(0);
}

function stars() {
  return container!.querySelectorAll('[data-star]');
}

afterEach(() => {
  if (root) {
    root.unmount();
    root = null;
  }
  container?.remove();
  container = null;
});

describe('StarMosaic', () => {
  it('fills the stars under the percent and lights the one being earned', async () => {
    await renderMosaic(55); // 8 tiles → 4 full, the 5th being earned (hot)
    expect(stars().length).toBe(8);
    expect(container!.querySelectorAll('[data-star-state="fill"]').length).toBe(4);
    expect(container!.querySelectorAll('[data-star-state="hot"]').length).toBe(1);
    expect(container!.querySelectorAll('[data-star-state="empty"]').length).toBe(3);
    expect(container!.querySelector('[role="img"]')!.getAttribute('aria-label')).toBe(
      'Collective progress: 50 percent'
    );
  });

  it('a full target lights every star; zero lights none', async () => {
    await renderMosaic(100);
    expect(container!.querySelectorAll('[data-star-state="fill"]').length).toBe(8);
    await renderMosaic(0);
    expect(container!.querySelectorAll('[data-star-state="fill"]').length).toBe(0);
    expect(container!.querySelectorAll('[data-star-state="hot"]').length).toBe(0);
  });

  it('clamps out-of-range percents', async () => {
    await renderMosaic(140);
    expect(container!.querySelectorAll('[data-star-state="fill"]').length).toBe(8);
    await renderMosaic(-5);
    expect(container!.querySelectorAll('[data-star-state="empty"]').length).toBe(8);
  });
});
