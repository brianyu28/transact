/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

// Relative base so the build works from any static host or sub-path
// (Cloudflare Workers, GitHub Pages, etc.). Routing uses the URL hash.
export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  worker: { format: 'es' },
  build: {
    // The app shell (React + Mantine) is ~500 kB minified / ~155 kB gzipped and is
    // precached by the service worker, so one chunk of that size is acceptable.
    chunkSizeWarningLimit: 700,
  },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  css: {
    modules: { localsConvention: 'camelCaseOnly' },
  },
  plugins: [
    react(),
    VitePWA({
      // Never reload under the user mid-edit: we show an "update available" prompt instead.
      registerType: 'prompt',
      injectRegister: false,
      // Icons are generated from public/favicon.svg (see pwa-assets.config.ts).
      pwaAssets: { config: true, overrideManifestIcons: true },
      manifest: {
        name: 'Transact',
        short_name: 'Transact',
        description: 'Personal finance and budgeting, stored in your own files.',
        theme_color: '#1f2933',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: './',
        scope: './',
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: 'index.html',
      },
      devOptions: { enabled: false },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: { modules: { classNameStrategy: 'non-scoped' } },
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
