/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

/** Headers for every path in public/_headers, so `pnpm preview` matches production. */
function productionHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  let inGlobalBlock = false;
  for (const line of readFileSync('public/_headers', 'utf8').split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    if (!/^\s/.test(line)) inGlobalBlock = line.trim() === '/*';
    else if (inGlobalBlock) {
      const colon = line.indexOf(':');
      headers[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
    }
  }
  // Local previews are plain HTTP; HSTS would be ignored anyway.
  delete headers['Strict-Transport-Security'];
  return headers;
}

// Relative base so the build works from any static host or sub-path
// (Cloudflare Workers, GitHub Pages, etc.). Routing uses the URL hash.
export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  worker: { format: 'es' },
  preview: { headers: productionHeaders() },
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
      manifest: {
        name: 'Transact',
        short_name: 'Transact',
        description: 'Personal finance and budgeting, stored in your own files.',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        // Stable identity for the installed app, independent of start_url.
        id: '/',
        display: 'standalone',
        // Installed on desktop, draw the app's own top bar in place of the title bar
        // (Chrome/Edge "window controls overlay"); other platforms use standalone.
        display_override: ['window-controls-overlay'],
        // Reopening the app focuses the open window instead of starting a second copy
        // (two windows editing one file would only produce conflicts).
        launch_handler: { client_mode: 'focus-existing' },
        categories: ['finance', 'productivity'],
        start_url: './',
        scope: './',
        // Generated from assets/icon.svg by `pnpm gen:icons`.
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
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
