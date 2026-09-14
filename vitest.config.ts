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
  },
});
