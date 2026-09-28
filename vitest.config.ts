import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      // vite-plugin-pwa's virtual module only exists under the build/dev
      // configs; point it at our controllable test stub instead.
      'virtual:pwa-register/react': path.resolve(__dirname, 'tests/mocks/virtual-pwa-register.ts'),
    },
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    // CI runners run the DOM tests 2-4x slower than laptops; the 5s default
    // flaked on the slowest counter tests even though every in-test waitFor
    // already had its own generous budget. 20s bounds the worst case while
    // still failing fast on a real deadlock.
    testTimeout: 20_000,
  },
});
