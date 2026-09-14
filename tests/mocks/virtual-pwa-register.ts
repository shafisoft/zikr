/**
 * Test stub for the vite-plugin-pwa virtual module
 * `virtual:pwa-register/react`, aliased in vitest.config.ts (the PWA plugin
 * only runs in the build/dev configs, so Vitest cannot resolve the virtual
 * import). Tests drive the banner through `pwaMockState`.
 */

import { vi } from 'vitest';

export const pwaMockState = {
  offlineReady: false,
  needRefresh: false,
  setOfflineReady: (v: boolean) => {
    pwaMockState.offlineReady = v;
  },
  setNeedRefresh: (v: boolean) => {
    pwaMockState.needRefresh = v;
  },
  updateServiceWorker: vi.fn(),
};

export function useRegisterSW() {
  return {
    offlineReady: [pwaMockState.offlineReady, pwaMockState.setOfflineReady],
    needRefresh: [pwaMockState.needRefresh, pwaMockState.setNeedRefresh],
    updateServiceWorker: pwaMockState.updateServiceWorker,
  };
}

export default { useRegisterSW };
