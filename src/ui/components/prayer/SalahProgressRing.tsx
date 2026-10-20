/**
 * SalahProgressRing — one salah chip's status glyph: an outlined circle
 * that fills clockwise, pie-style, in proportion to the set's progress.
 * Empty at 0 (nothing performed yet); a growing wedge while the set is
 * partly done. The DONE state is not drawn here — the tracker swaps the
 * ring for the filled check icon, which the full wedge visually hands off
 * to (a solid disc either way). Presentational only; `currentColor` paints
 * both outline and wedge, so the caller's text-color class sets the tone.
 */

import React from 'react';

interface SalahProgressRingProps {
  /** 0..1 reached fraction of the set (clamped). */
  progress: number;
  className?: string;
}

const SIZE = 20;
const OUTLINE_WIDTH = 1.75;
const OUTER_RADIUS = (SIZE - OUTLINE_WIDTH) / 2;
/** The wedge disc stops short of the outline's inner edge by a hairline gap. */
const FILL_RADIUS = OUTER_RADIUS - OUTLINE_WIDTH;
// A circle stroked as wide as its own diameter renders as a solid disc, so
// its dash length becomes a pie sector — no path math for the arc end.
const WEDGE_RADIUS = FILL_RADIUS / 2;
const WEDGE_CIRCUMFERENCE = 2 * Math.PI * WEDGE_RADIUS;
/**
 * The thinnest wedge still readable at 20px. One recitation of a 34-count
 * item is 0.6% of the set — honest in the data, invisible on screen — so any
 * non-zero progress shows at least this sliver.
 */
const MIN_VISIBLE_FRACTION = 0.06;

const SalahProgressRing: React.FC<SalahProgressRingProps> = ({ progress, className = '' }) => {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
  const shown = clamped > 0 ? Math.max(clamped, MIN_VISIBLE_FRACTION) : 0;
  const center = SIZE / 2;

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      width={SIZE}
      height={SIZE}
      aria-hidden="true"
      focusable="false"
      className={className}
      data-slot-progress={clamped.toFixed(2)}
    >
      <circle
        cx={center}
        cy={center}
        r={OUTER_RADIUS}
        fill="none"
        stroke="currentColor"
        strokeWidth={OUTLINE_WIDTH}
      />
      {shown > 0 && (
        <circle
          cx={center}
          cy={center}
          r={WEDGE_RADIUS}
          fill="none"
          stroke="currentColor"
          strokeWidth={FILL_RADIUS}
          strokeDasharray={WEDGE_CIRCUMFERENCE}
          strokeDashoffset={WEDGE_CIRCUMFERENCE * (1 - shown)}
          transform={`rotate(-90 ${center} ${center})`}
          className="transition-[stroke-dashoffset] duration-500 ease-out"
        />
      )}
    </svg>
  );
};

export default SalahProgressRing;
