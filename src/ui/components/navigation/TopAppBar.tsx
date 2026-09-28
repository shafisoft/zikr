/**
 * Top App Bar Component
 * Fixed header: brand (app icon + name) or back/close at the left,
 * optional page title, and optional top-right action button(s).
 */

import React from 'react';
import MaterialIcon from '../MaterialIcon';
import { HeaderProps } from '../../types/components';

export const TopAppBar: React.FC<HeaderProps> = ({
  title,
  brand = false,
  showBack = false,
  showClose = false,
  onBack,
  onClose,
  action,
  actions = [],
}) => {
  const allActions = action ? [action, ...actions] : actions;
  const showLeading = showBack || showClose;

  return (
    <header className="fixed top-0 left-1/2 -translate-x-1/2 w-full max-w-md z-50 bg-surface/85 backdrop-blur-md border-b border-outline-variant/30 flex justify-between items-center h-16 px-container-padding-mobile">
      {/* Left: Brand, Back/Close, or spacer */}
      {showLeading ? (
        <button
          onClick={showBack ? onBack : onClose}
          aria-label={showBack ? 'Go back' : 'Close'}
          className="text-on-surface-variant hover:opacity-80 active:scale-95 transition-all w-touch-target-min h-touch-target-min flex items-center justify-center -ml-4"
        >
          <MaterialIcon
            icon={showBack ? 'arrow_back' : 'close'}
            className="text-2xl"
          />
        </button>
      ) : brand ? (
        <div className="flex items-center gap-2.5">
          <img src="/zikr.svg" alt="" className="w-7 h-7" aria-hidden="true" />
          <span className="font-headline-md text-headline-md text-primary font-bold">
            Zikr
          </span>
        </div>
      ) : (
        <div className="w-touch-target-min -ml-4" />
      )}

      {/* Center: Title — one line, ellipsized; a long zikr name must never
          wrap the bar into a broken two-line header. */}
      {title && (
        <h1 className="font-headline-md text-headline-md text-primary font-bold flex-1 min-w-0 text-center truncate px-2">
          {title}
        </h1>
      )}

      {/* Right: Action buttons */}
      {allActions.length > 0 && (
        <div className="flex items-center -mr-4">
          {allActions.map((a, i) => (
            <button
              key={`${a.ariaLabel}-${i}`}
              onClick={a.onClick}
              aria-label={a.ariaLabel}
              className="text-primary hover:opacity-80 active:scale-95 transition-all w-touch-target-min h-touch-target-min flex items-center justify-center"
            >
              <MaterialIcon icon={a.icon} filled={true} className="text-2xl" />
            </button>
          ))}
        </div>
      )}

      {/* Right spacer when no actions */}
      {allActions.length === 0 && <div className="w-touch-target-min -mr-4" />}
    </header>
  );
};

export default TopAppBar;
