import { describe, expect, it, vi } from 'vitest';

interface Options {
  createHTML: (input: string) => string | null;
  createScript: (input: string) => string | null;
  createScriptURL: (input: string) => string | null;
}

/** Loads the module against a stub Trusted Types API and returns the policy it creates. */
async function loadPolicy(): Promise<{ name: string; options: Options }> {
  const createPolicy = vi.fn();
  vi.stubGlobal('trustedTypes', { createPolicy });
  vi.resetModules();
  await import('./trustedTypes');
  vi.unstubAllGlobals();
  const [name, options] = createPolicy.mock.calls[0] as [string, Options];
  return { name, options };
}

describe('Trusted Types policy', () => {
  it('is the default policy', async () => {
    expect((await loadPolicy()).name).toBe('default');
  });

  it('allows HTML strings without markup only', async () => {
    const { options } = await loadPolicy();
    const css = ':root { --mantine-color-body: #fff; } a > b { transition: none !important; }';
    expect(options.createHTML(css)).toBe(css);
    expect(options.createHTML('<img src=x onerror=alert(1)>')).toBeNull();
    expect(options.createHTML('</style><script>alert(1)</script>')).toBeNull();
  });

  it('rejects script strings', async () => {
    expect((await loadPolicy()).options.createScript('alert(1)')).toBeNull();
  });

  it('allows script URLs from this origin only', async () => {
    const { options } = await loadPolicy();
    expect(options.createScriptURL('./sw.js')).toBe('./sw.js');
    expect(options.createScriptURL(`${location.origin}/assets/io.worker.js`)).not.toBeNull();
    expect(options.createScriptURL('https://evil.example/x.js')).toBeNull();
    expect(options.createScriptURL('data:text/javascript,alert(1)')).toBeNull();
    expect(options.createScriptURL('javascript:alert(1)')).toBeNull();
  });
});
