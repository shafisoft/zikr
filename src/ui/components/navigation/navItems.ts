/**
 * Central navigation items for the bottom bar.
 * `label` holds an i18n key (translated at render time in BottomNav).
 * Settings is NOT a tab — it opens from the top-right gear on each screen.
 *
 * The Group tab is only offered when the shared-rooms backend is configured;
 * a dead tab with a "not set up" notice is worse than no tab.
 */

import { NavItem } from '../../types/components';
import { useSharedRoomStore } from '../../../core/stores/sharedRoomStore';

const BASE_ITEMS: NavItem[] = [
  { id: 'home', label: 'nav.home', icon: 'home', path: '/' },
  { id: 'plans', label: 'nav.plans', icon: 'target', path: '/plans' },
  { id: 'group', label: 'nav.group', icon: 'groups', path: '/group' },
  { id: 'progress', label: 'nav.progress', icon: 'trending_up', path: '/progress' },
];

/** Nav items for the current build — Group included only when available. */
export function getNavItems(): NavItem[] {
  if (!useSharedRoomStore.getState().isBackendConfigured()) {
    return BASE_ITEMS.filter((item) => item.id !== 'group');
  }
  return BASE_ITEMS;
}
