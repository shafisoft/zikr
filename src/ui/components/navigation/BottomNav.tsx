/**
 * Bottom Navigation Component
 * Mobile bottom navigation bar with active state highlighting.
 * Active item: deep green pill with a gold icon — the Noor design signature.
 *
 * Self-contained: reads the tab list, derives the active tab from the
 * current URL, and navigates on tap. Screens just toggle it on via
 * AppLayout's `bottomNav`.
 */

import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import MaterialIcon from '../MaterialIcon';
import { useI18n } from '../../../core/i18n';
import { getNavItems } from './navItems';

interface BottomNavProps {
  className?: string;
}

export const BottomNav: React.FC<BottomNavProps> = ({ className = '' }) => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const items = getNavItems();
  // Home is the index route (exact match); the other tabs match by prefix
  // so detail screens under them would highlight too, if any appear.
  const activeId = items.find(item =>
    item.path === '/' ? pathname === '/' || pathname === '/home' : pathname.startsWith(item.path)
  )?.id;

  return (
    <nav
      aria-label="Main navigation"
      className={`
        fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md z-50
        bg-surface/90 backdrop-blur-lg
        rounded-t-2xl border-t border-outline-variant/20 shadow-card
        flex justify-around items-center
        h-touch-target-min pb-safe
        px-4 pt-2
        ${className}
      `}
    >
      {items.map((item) => {
        const isActive = item.id === activeId;

        return (
          <button
            key={item.id}
            onClick={() => navigate(item.path)}
            className={`
              flex-1 flex flex-col items-center justify-center
              py-1
              rounded-xl
              active-scale-90 transition-transform duration-150
              ${isActive
                ? 'bg-primary-container text-on-primary-container'
                : 'text-on-surface-variant hover:bg-surface-variant/50'
              }
            `}
            aria-label={t(item.label)}
            aria-current={isActive ? 'page' : undefined}
          >
            <MaterialIcon
              icon={item.icon}
              filled={isActive}
              className={isActive ? 'text-tertiary-fixed' : ''}
            />
            <span className="font-label-md text-label-md text-[10px] leading-tight mt-0.5">
              {t(item.label)}
            </span>
          </button>
        );
      })}
    </nav>
  );
};

export default BottomNav;
