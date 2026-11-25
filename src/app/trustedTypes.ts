/**
 * Trusted Types policy. The Content Security Policy (public/_headers) requires Trusted Types
 * for every DOM sink that can run code or parse markup: `innerHTML`, `outerHTML`,
 * `document.write`, script URLs (`new Worker`, service worker registration) and so on.
 * This is the one policy the CSP allows, and it allows:
 *
 * - **HTML strings without markup only** (no `<`). Such a string can only ever become text,
 *   never an element, attribute or script. Mantine needs this: it writes its CSS into
 *   `<style>` elements this way. Anything that would create elements is rejected, so an
 *   injection bug can't become markup.
 * - **No script strings** (eval-like sinks).
 * - **Script URLs from this origin only** (the I/O worker and the service worker).
 *
 * Imported first in main.tsx, so it exists before any other code runs.
 */

interface TrustedTypePolicyOptions {
  createHTML?: (input: string) => string | null;
  createScript?: (input: string) => string | null;
  createScriptURL?: (input: string) => string | null;
}

declare global {
  interface Window {
    trustedTypes?: {
      createPolicy(name: string, options: TrustedTypePolicyOptions): unknown;
    };
  }
}

function sameOriginScriptURL(input: string): string | null {
  try {
    return new URL(input, document.baseURI).origin === location.origin ? input : null;
  } catch {
    return null;
  }
}

// Browsers without Trusted Types skip this; the rest of the CSP still applies there.
// Returning null rejects a value: the assignment throws instead of running.
window.trustedTypes?.createPolicy('default', {
  createHTML: (input) => (input.includes('<') ? null : input),
  createScript: () => null,
  createScriptURL: sameOriginScriptURL,
});

export {};
