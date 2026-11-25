import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  completeDropboxSignIn,
  connectDropbox,
  disconnectDropbox,
  dropboxAdapter,
  dropboxState,
  listDropboxFiles,
  setDropboxAppKey,
} from './dropbox';

const bytes = (s: string) => new TextEncoder().encode(s);

/** A fake Dropbox: one file with a revision, plus the token endpoint. */
function fakeDropbox() {
  const server = {
    content: 'v1',
    rev: 'r1',
    tokenCalls: 0,
    expireNext: false,
    revokedWith: [] as string[],
  };
  const respond = (url: string, init: RequestInit): Response => {
    const headers = (init.headers ?? {}) as Record<string, string>;
    const arg = headers['Dropbox-API-Arg']
      ? (JSON.parse(headers['Dropbox-API-Arg']) as Record<string, unknown>)
      : {};
    const meta = () => ({
      name: 'budget.transact.json',
      path_display: '/budget.transact.json',
      rev: server.rev,
      server_modified: '2026-11-01T00:00:00Z',
      size: server.content.length,
    });
    if (url.endsWith('/oauth2/token')) {
      server.tokenCalls += 1;
      return Response.json({
        access_token: `token${String(server.tokenCalls)}`,
        refresh_token: 'refresh',
        expires_in: 14400,
      });
    }
    if (url.endsWith('/auth/token/revoke')) {
      const token = headers.Authorization?.replace('Bearer ', '') ?? '';
      if (token === 'token0' && server.expireNext) return new Response('', { status: 401 });
      server.revokedWith.push(token);
      return Response.json(null);
    }
    if (server.expireNext) {
      server.expireNext = false;
      return new Response('expired', { status: 401 });
    }
    if (url.endsWith('/files/list_folder')) {
      return Response.json({
        entries: [{ '.tag': 'file', ...meta() }],
        has_more: false,
        cursor: '',
      });
    }
    if (url.endsWith('/files/download')) {
      return new Response(server.content, {
        headers: { 'Dropbox-API-Result': JSON.stringify(meta()) },
      });
    }
    if (url.endsWith('/files/upload')) {
      const mode = arg.mode as { update?: string } | string;
      if (typeof mode === 'object' && mode.update !== server.rev) {
        return Response.json({ error_summary: 'path/conflict/file/' }, { status: 409 });
      }
      server.content = new TextDecoder().decode(init.body as Uint8Array);
      server.rev = `r${String(Number(server.rev.slice(1)) + 1)}`;
      return Response.json(meta());
    }
    return new Response('not found', { status: 404 });
  };
  const fetchMock = vi.fn((url: string, init: RequestInit) => Promise.resolve(respond(url, init)));
  vi.stubGlobal('fetch', fetchMock);
  return { server, fetchMock };
}

function signedIn() {
  localStorage.setItem(
    'transact:dropbox',
    JSON.stringify({
      accessToken: 'token0',
      refreshToken: 'refresh',
      expiresAt: Date.now() + 3_600_000,
    }),
  );
  dropboxState.setState({ connected: true });
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  setDropboxAppKey('test-app-key');
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('dropbox adapter', () => {
  it('signs in with PKCE and stores tokens', async () => {
    const { fetchMock } = fakeDropbox();
    const assign = vi.fn();
    vi.stubGlobal('location', {
      assign,
      origin: 'http://localhost',
      pathname: '/',
      search: '',
      hash: '#/settings',
    });
    await connectDropbox();
    const authorizeUrl = new URL(assign.mock.calls[0]![0] as string);
    expect(authorizeUrl.searchParams.get('code_challenge_method')).toBe('S256');
    const state = authorizeUrl.searchParams.get('state');

    vi.stubGlobal('location', {
      origin: 'http://localhost',
      pathname: '/',
      search: `?code=abc&state=${state ?? ''}`,
      hash: '',
    });
    vi.stubGlobal('history', { replaceState: vi.fn() });
    expect(await completeDropboxSignIn()).toBe(true);
    const body = fetchMock.mock.calls[0]![1].body as URLSearchParams;
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code_verifier')).toBeTruthy();
    expect(dropboxState.getState().connected).toBe(true);
  });

  it('rejects a sign-in response that does not match the request', async () => {
    fakeDropbox();
    sessionStorage.setItem(
      'transact:dropbox-pending',
      JSON.stringify({ verifier: 'v', state: 'expected', hash: '' }),
    );
    vi.stubGlobal('location', {
      origin: 'http://localhost',
      pathname: '/',
      search: '?code=abc&state=forged',
      hash: '',
    });
    vi.stubGlobal('history', { replaceState: vi.fn() });
    await expect(completeDropboxSignIn()).rejects.toThrow(/didn’t match/);
  });

  it('ignores sign-in parameters when no sign-in was started in this tab', async () => {
    const { fetchMock } = fakeDropbox();
    vi.stubGlobal('location', {
      origin: 'http://localhost',
      pathname: '/',
      search: '?error=x&error_description=Session+expired.+Sign+in+at+evil.example',
      hash: '#/home',
    });
    const replaceState = vi.fn();
    vi.stubGlobal('history', { replaceState });
    expect(await completeDropboxSignIn()).toBe(false);
    expect(replaceState).toHaveBeenCalledWith(null, '', 'http://localhost/#/home');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never shows the error text from the URL', async () => {
    fakeDropbox();
    sessionStorage.setItem(
      'transact:dropbox-pending',
      JSON.stringify({ verifier: 'v', state: 'expected', hash: '' }),
    );
    vi.stubGlobal('location', {
      origin: 'http://localhost',
      pathname: '/',
      search: '?error=server_error&error_description=Visit+evil.example&state=expected',
      hash: '',
    });
    vi.stubGlobal('history', { replaceState: vi.fn() });
    const failure = completeDropboxSignIn();
    await expect(failure).rejects.toThrow('Dropbox sign-in failed. Try connecting again.');
    await expect(failure).rejects.not.toThrow(/evil/);
  });

  it('revokes access on disconnect, refreshing an expired token first', async () => {
    const { server } = fakeDropbox();
    localStorage.setItem(
      'transact:dropbox',
      JSON.stringify({ accessToken: 'token0', refreshToken: 'refresh', expiresAt: 0 }),
    );
    expect(await disconnectDropbox()).toBe(true);
    expect(server.tokenCalls).toBe(1);
    expect(server.revokedWith).toEqual(['token1']);
    expect(localStorage.getItem('transact:dropbox')).toBeNull();
  });

  it('retries the revoke with a fresh token when the access token was rejected', async () => {
    const { server } = fakeDropbox();
    signedIn();
    server.expireNext = true; // token0 is rejected
    expect(await disconnectDropbox()).toBe(true);
    expect(server.revokedWith).toEqual(['token1']);
  });

  it('reports a disconnect that could not revoke access', async () => {
    signedIn();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('offline'))),
    );
    expect(await disconnectDropbox()).toBe(false);
    expect(dropboxState.getState().connected).toBe(false);
  });

  it('lists, opens and saves with revision checks', async () => {
    const { server } = fakeDropbox();
    signedIn();
    const files = await listDropboxFiles();
    expect(files.map((f) => f.name)).toEqual(['budget.transact.json']);

    const opened = await dropboxAdapter.reopen!(undefined, {
      kind: 'dropbox',
      name: 'budget.transact.json',
      path: '/budget.transact.json',
    });
    expect(opened?.version).toEqual({ rev: 'r1' });

    const ok = await dropboxAdapter.save(bytes('v2'), {
      handle: undefined,
      descriptor: opened!.descriptor,
      base: { rev: 'r1' },
    });
    expect(ok).toMatchObject({ ok: true, version: { rev: 'r2' } });
    expect(server.content).toBe('v2');

    // A save based on an old revision is refused and returns the current content.
    const stale = await dropboxAdapter.save(bytes('v3'), {
      handle: undefined,
      descriptor: opened!.descriptor,
      base: { rev: 'r1' },
    });
    expect(stale).toMatchObject({ ok: false, reason: 'changed', version: { rev: 'r2' } });
    expect(server.content).toBe('v2');
  });

  it('refreshes an expired access token and retries', async () => {
    const { server } = fakeDropbox();
    signedIn();
    server.expireNext = true;
    expect(await listDropboxFiles()).toHaveLength(1);
    expect(server.tokenCalls).toBe(1);
  });
});
