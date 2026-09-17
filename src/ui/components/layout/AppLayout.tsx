/**
 * App Layout
 * The single owner of the screen frame: phone-width column shell, top app
 * bar, bottom tab bar, and the spacing that clears the fixed bars. Pages
 * describe their chrome declaratively (topBar/bottomNav) and render only
 * their content — no page carries shell classes or bar wiring anymore.
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import TopAppBar from '../navigation/TopAppBar';
import BottomNav from '../navigation/BottomNav';
import ConfirmDialogHost from '../ConfirmDialog';
import { HeaderAction } from '../../types/components';

export interface AppLayoutTopBar {
  /** App icon + wordmark at the left (main screens). */
  brand?: boolean;
  /** Centered title. */
  title?: string;
  /** arrow_back on the left; defaults to history back when no onBack. */
  back?: boolean;
  onBack?: () => void;
  /** Close (×) on the left. */
  close?: boolean;
  onClose?: () => void;
  /** Top-right action icons (e.g. useNavActions() or a single add button). */
  actions?: HeaderAction[];
}

interface AppLayoutProps {
  topBar?: AppLayoutTopBar;
  /** Show the bottom tab bar; the active tab follows the current URL. */
  bottomNav?: boolean;
  /**
   * Screen-specific content classes — padding beyond the bar clearance,
   * max width, centering. Base clearance (pt-16 under the top bar,
   * pb-24 above the tab bar) is applied by the layout itself.
   */
  contentClassName?: string;
  children: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  topBar,
  bottomNav = false,
  contentClassName = '',
  children,
}) => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-surface text-on-surface antialiased flex flex-col max-w-md mx-auto">
      {topBar && (
        <TopAppBar
          title={topBar.title}
          brand={topBar.brand}
          showBack={topBar.back}
          onBack={topBar.back ? topBar.onBack ?? (() => navigate(-1)) : topBar.onBack}
          showClose={topBar.close}
          onClose={topBar.onClose}
          actions={topBar.actions}
        />
      )}

      {/* Bar clearance lives on its own wrapper so it ADDS to (never
          conflicts with) the screen's own padding in contentClassName —
          Tailwind p*-N classes on one element would override each other. */}
      <div
        className={`flex-1 flex flex-col ${topBar ? 'pt-16' : ''} ${bottomNav ? 'pb-24' : ''}`}
      >
        <main className={`flex-1 flex flex-col ${contentClassName}`}>
          {children}
        </main>
      </div>

      {bottomNav && <BottomNav />}

      {/* Promise-based confirm/alert dialog — every page gets one host. */}
      <ConfirmDialogHost />
    </div>
  );
};

export default AppLayout;
