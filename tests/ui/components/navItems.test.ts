// Bottom-nav items (Noor 2.0 phase 2): the counter becomes a tab —
// counting is the core differentiator, one tap away. Group stays
// conditional on the shared-rooms backend (spied — env-dependent).
import { describe, it, expect, afterEach, vi } from 'vitest';
import { getNavItems } from '../../../src/ui/components/navigation/navItems';
import { sharedRoomService } from '../../../src/core/services/sharedRoom';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getNavItems', () => {
  it('offers the counter tab between Home and Plans', () => {
    const items = getNavItems();
    const counter = items.find(i => i.id === 'counter');
    expect(counter).toMatchObject({
      path: '/counter',
      label: 'nav.counter',
      icon: 'fingerprint',
    });
    expect(items.map(i => i.id)).toContain('counter');
  });

  it('keeps the group tab conditional, counter unconditional', () => {
    vi.spyOn(sharedRoomService, 'isConfigured').mockReturnValue(false);
    expect(getNavItems().map(i => i.id)).toEqual(['home', 'counter', 'plans', 'progress']);

    vi.spyOn(sharedRoomService, 'isConfigured').mockReturnValue(true);
    expect(getNavItems().map(i => i.id)).toEqual(['home', 'counter', 'plans', 'group', 'progress']);
  });
});
