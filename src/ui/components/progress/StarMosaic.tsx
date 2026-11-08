/**
 * StarMosaic — the Circle's communal goal as a khatam-star strip (Noor 2.0
 * phase 4): eight eight-pointed stars that fill as the group's collective
 * target fills, with the star currently being earned lit in gold. Render
 * only — the percent arrives from the caller (the group's mirrored plan
 * progress); nobody's name is shown, matching the members' anonymity.
 */

import React from 'react';

interface StarMosaicProps {
  /** 0–100 collective fill. */
  percent: number;
  /** Tile count (default 8 — one visible star per ~12.5% step). */
  tiles?: number;
  /** Accessible description of the collective fill. */
  ariaLabel: string;
}

/** One 8-pointed khatam star (16-gon outline), drawn once per module load. */
function starPath(size: number): string {
  const c = size / 2;
  const outer = c - 1;
  const inner = outer * 0.58;
  const pts: string[] = [];
  for (let i = 0; i < 16; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (-90 + i * 22.5) * (Math.PI / 180);
    pts.push(`${(c + r * Math.cos(a)).toFixed(2)},${(c + r * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
}

const STAR_D = starPath(32);

const StarMosaic: React.FC<StarMosaicProps> = ({ percent, tiles = 8, ariaLabel }) => {
  const clamped = Math.max(0, Math.min(100, percent));
  const fillFloat = (clamped / 100) * tiles;
  const filled = Math.floor(fillFloat + 1e-9);
  const hotIndex = filled < tiles && fillFloat - filled > 0.1 ? filled : -1;

  return (
    <div className="flex items-center gap-1" role="img" aria-label={ariaLabel}>
      {Array.from({ length: tiles }, (_, i) => {
        const tone =
          i < filled
            ? 'fill-primary-container'
            : i === hotIndex
              ? 'fill-tertiary'
              : 'fill-surface-container-high';
        return (
          <svg
            key={i}
            viewBox="0 0 32 32"
            className="h-6 w-6 shrink-0"
            aria-hidden="true"
            data-star={i}
            data-star-state={i < filled ? 'fill' : i === hotIndex ? 'hot' : 'empty'}
          >
            <path d={STAR_D} className={`${tone} transition-colors duration-300`} />
          </svg>
        );
      })}
    </div>
  );
};

export default StarMosaic;
