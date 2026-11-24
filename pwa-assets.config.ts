import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// Generates favicon / apple-touch / PWA icons from the single source SVG at build time.
export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: minimal2023Preset,
  images: ['public/favicon.svg'],
});
