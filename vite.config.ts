import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // GitHub Pages project sites serve from /<repo>/ — override per environment
  // via VITE_BASE (the deploy workflow computes it; custom domains use '/').
  base: process.env.VITE_BASE || '/',
  define: {
    // Settings page reads the app version; `process` doesn't exist in the browser
    'process.env.PACKAGE_VERSION': JSON.stringify(process.env.npm_package_version || '1.0.0'),
  },
  plugins: [
    react(),
    VitePWA({
      // 'prompt' + the in-app update banner (UpdateBanner.tsx): a new deploy
      // never silently serves different code — the user is told and reloads
      // into it. The app registers the worker itself via
      // virtual:pwa-register/react, so no injectRegister script is needed.
      registerType: 'prompt',
      // Serve the manifest + SW on the dev server too, so install intent
      // works on localhost while developing.
      devOptions: { enabled: true },
      includeAssets: ['icons/*.png', 'zikr.svg'],
      manifest: {
        name: 'Zikr',
        short_name: 'Zikr',
        description: 'Islamic dhikr practice tracker',
        theme_color: '#012d1d',
        background_color: '#faf7f0',
        display: 'standalone',
        // Relative to the manifest URL — survives a non-root base
        // (GitHub Pages serves project sites from /<repo>/).
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        // The updated worker must take over WITHOUT a user tap on the update
        // banner. With plain 'prompt' mode the new worker waits until
        // updateServiceWorker(true) runs — but any client already running a
        // build whose banner is broken/invisible (e.g. the version where it
        // sat under the navbar) can never activate it and is stuck forever.
        // skipWaiting + clientsClaim lets each deploy rescue those clients;
        // the running page keeps its old code until the next launch, so a
        // mid-session count is never wiped by a reload.
        skipWaiting: true,
        clientsClaim: true,
        // Serve index.html for cold-open navigations (e.g. /join/CODE invite
        // links opened offline or before the service worker has cached docs).
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts-cache' }
          },
          {
            // The font binaries live on gstatic, not googleapis — without this
            // rule the CSS above gets cached but the woff2 never does, and
            // offline every MaterialIcon ligature renders as raw text.
            // Icon/text fonts arrive as many unicode-range slices (~50 across
            // the five families), so cap the cache well above that count.
            // gstatic URLs are immutable, so CacheFirst never goes stale.
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              // Fonts load as cross-origin CSS requests; opaque responses
              // report status 0 and must be cached too.
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 365 }
            }
          },
          {
            // Shared-goals sync API: serve stale data offline, refresh online.
            urlPattern: /^https:\/\/[a-z0-9-]+\.supabase\.co\/rest\/v1\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'shared-room-cache',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 50, maxAgeSeconds: 86400 }
            }
          }
        ]
      }
    })
  ],
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'state-vendor': ['zustand', 'dexie']
        }
      }
    }
  }
});
