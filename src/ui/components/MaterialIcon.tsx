/**
 * Material Icon Component — inline SVG (Material Symbols, weight 400).
 *
 * Path data comes from iconPaths.generated.ts (baked into the JS bundle by
 * scripts/generate-icons.mjs), so icons render identically offline — there is
 * no icon webfont to fetch.
 *
 * Sizing/coloring: the svg is 1em × 1em with fill=currentColor, so the same
 * font-size and text-color utility classes as before apply (text-[18px],
 * text-tertiary, …).
 */
import React from 'react';
import { ICON_PATHS, ICON_VIEWBOX } from './icons/iconPaths.generated';

interface MaterialIconProps {
  icon: string;
  filled?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export const MaterialIcon: React.FC<MaterialIconProps> = ({
  icon,
  filled = false,
  className = '',
  style,
}) => {
  const paths = ICON_PATHS[icon];
  if (!paths) {
    if (import.meta.env.DEV) {
      console.warn(`[MaterialIcon] unknown icon "${icon}" — add it to scripts/generate-icons.mjs and run npm run gen:icons`);
    }
    return null;
  }

  return (
    <svg
      viewBox={ICON_VIEWBOX}
      width="1em"
      height="1em"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={className}
      style={style}
    >
      <path d={filled && paths.fill ? paths.fill : paths.d} />
    </svg>
  );
};

export default MaterialIcon;
