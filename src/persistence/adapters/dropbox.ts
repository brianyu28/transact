/**
 * Dropbox adapter: keeps the file in the app's own Dropbox folder (Apps/<app name>/), so the
 * app can't see anything else in the user's Dropbox. Sign-in uses OAuth with PKCE entirely in
 * the browser (no server). Saves use Dropbox revisions to detect changes made elsewhere.
 *
 * The app key comes from the build (VITE_DROPBOX_APP_KEY) or, for self-hosting, a device
 * setting. Tokens are kept in localStorage on this device only.
 */
import { createStore } from 'zustand/vanilla';
import type {
  OpenedFile,
  SaveResult,
  SourceDescriptor,
  StorageAdapter,
  VersionToken,
} from '../types';

const AUTHORIZE_URL = 'https://www.dropbox.com/oauth2/authorize';
const TOKEN_URL = 'https://api.dropboxapi.com/oauth2/token';
const API = 'https://api.dropboxapi.com/2';
const CONTENT = 'https://content.dropboxapi.com/2';

const TOKENS_KEY = 'transact:dropbox';
const APP_KEY_KEY = 'transact:dropbox-app-key';
const PENDING_KEY = 'transact:dropbox-pending';

interface Tokens {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms. */
  expiresAt: number;
}

export interface DropboxFile {
  name: string;
  path: string;
  rev: string;
  modified: string;
  size: number;
}

/** Reactive connection state for the UI. */
export const dropboxState = createStore<{ connected: boolean; appKey: string }>()(() => ({
  connected: readTokens() !== null,
  appKey: currentAppKey(),
}));

function currentAppKey(): string {
  const env = (import.meta.env.VITE_DROPBOX_APP_KEY as string | undefined) ?? '';
  if (typeof localStorage === 'undefined') return env;
  return localStorage.getItem(APP_KEY_KEY) ?? env;
}

/** Sets the app key used on this device (for self-hosted builds without one). */
export function setDropboxAppKey(key: string): void {
  const trimmed = key.trim();
  if (trimmed) localStorage.setItem(APP_KEY_KEY, trimmed);
  else localStorage.removeItem(APP_KEY_KEY);
  dropboxState.setState({ appKey: currentAppKey() });
}

function readTokens(): Tokens | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(TOKENS_KEY);
    return raw ? (JSON.parse(raw) as Tokens) : null;
  } catch {
    return null;
  }
}

function writeTokens(tokens: Tokens | null) {
  if (tokens) localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
  else localStorage.removeItem(TOKENS_KEY);
  dropboxState.setState({ connected: tokens !== null });
}

function redirectUri(): string {
  return location.origin + location.pathname;
}

function base64Url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomString(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(32)));
}

/** Starts sign-in: navigates to Dropbox, which returns to this page with a code. */
export async function connectDropbox(): Promise<void> {
  const appKey = currentAppKey();
  if (!appKey) throw new Error('No Dropbox app key is configured.');
  const verifier = randomString();
  const state = randomString();
  const challenge = base64Url(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))),
  );
  sessionStorage.setItem(PENDING_KEY, JSON.stringify({ verifier, state, hash: location.hash }));
  const params = new URLSearchParams({
    client_id: appKey,
    response_type: 'code',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    token_access_type: 'offline',
    redirect_uri: redirectUri(),
    state,
  });
  location.assign(`${AUTHORIZE_URL}?${params.toString()}`);
}

/**
 * Finishes sign-in if this page load is the return from Dropbox. Returns true if it
 * connected, false if there was nothing to do; throws if Dropbox reported an error.
 */
export async function completeDropboxSignIn(): Promise<boolean> {
  const params = new URLSearchParams(location.search);
  const code = params.get('code');
  const error = params.get('error_description') ?? params.get('error');
  const pendingRaw = sessionStorage.getItem(PENDING_KEY);
  if (!code && !error) return false;
  sessionStorage.removeItem(PENDING_KEY);
  const pending = pendingRaw
    ? (JSON.parse(pendingRaw) as { verifier: string; state: string; hash: string })
    : null;
  // Drop the query string so a reload doesn't repeat this.
  history.replaceState(null, '', redirectUri() + (pending?.hash ?? ''));
  if (error) throw new Error(`Dropbox sign-in failed: ${error}`);
  if (!pending || params.get('state') !== pending.state) {
    throw new Error('Dropbox sign-in failed: the response didn’t match the request.');
  }
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    body: new URLSearchParams({
      code: code ?? '',
      grant_type: 'authorization_code',
      code_verifier: pending.verifier,
      client_id: currentAppKey(),
      redirect_uri: redirectUri(),
    }),
  });
  if (!response.ok) throw new Error(`Dropbox sign-in failed (${String(response.status)}).`);
  const body = (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
  writeTokens({
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: Date.now() + body.expires_in * 1000,
  });
  return true;
}

/** Signs out of Dropbox on this device. */
export async function disconnectDropbox(): Promise<void> {
  const tokens = readTokens();
  writeTokens(null);
  if (tokens) {
    await fetch(`${API}/auth/token/revoke`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    }).catch(() => undefined);
  }
}

async function accessToken(forceRefresh = false): Promise<string> {
  const tokens = readTokens();
  if (!tokens) throw new Error('Not connected to Dropbox. Connect in Settings → Storage.');
  if (!forceRefresh && tokens.expiresAt - 60_000 > Date.now()) return tokens.accessToken;
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokens.refreshToken,
      client_id: currentAppKey(),
    }),
  });
  if (response.status === 400 || response.status === 401) {
    writeTokens(null); // access was revoked
    throw new Error('Dropbox access has expired. Connect again in Settings → Storage.');
  }
  if (!response.ok) throw new Error(`Dropbox is unavailable (${String(response.status)}).`);
  const body = (await response.json()) as { access_token: string; expires_in: number };
  const next = {
    ...tokens,
    accessToken: body.access_token,
    expiresAt: Date.now() + body.expires_in * 1000,
  };
  writeTokens(next);
  return next.accessToken;
}

/** HTTP header values must be ASCII: escape everything else as JSON \u sequences. */
function apiArg(arg: unknown): string {
  return JSON.stringify(arg).replace(
    /[\u007f-￿]/g,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
}

/** Calls Dropbox, refreshing the token once if it expired. */
async function call(url: string, init: RequestInit): Promise<Response> {
  const send = async (token: string) =>
    fetch(url, {
      ...init,
      headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` },
    });
  let response = await send(await accessToken());
  if (response.status === 401) response = await send(await accessToken(true));
  return response;
}

async function failure(response: Response): Promise<Error> {
  const text = await response.text().catch(() => '');
  let summary = text;
  try {
    summary = (JSON.parse(text) as { error_summary?: string }).error_summary ?? text;
  } catch {
    // plain-text error
  }
  return new Error(`Dropbox error (${String(response.status)}): ${summary || 'unknown'}`);
}

interface FileMetadata {
  name: string;
  path_display: string;
  rev: string;
  server_modified: string;
  size: number;
}

const toFile = (m: FileMetadata): DropboxFile => ({
  name: m.name,
  path: m.path_display,
  rev: m.rev,
  modified: m.server_modified,
  size: m.size,
});

/** Data files in the app folder, newest first. */
export async function listDropboxFiles(): Promise<DropboxFile[]> {
  const files: DropboxFile[] = [];
  let response = await call(`${API}/files/list_folder`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: '' }),
  });
  for (;;) {
    if (!response.ok) throw await failure(response);
    const page = (await response.json()) as {
      entries: (FileMetadata & { '.tag': string })[];
      has_more: boolean;
      cursor: string;
    };
    for (const e of page.entries) {
      if (e['.tag'] === 'file' && e.name.toLowerCase().endsWith('.json')) files.push(toFile(e));
    }
    if (!page.has_more) break;
    response = await call(`${API}/files/list_folder/continue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cursor: page.cursor }),
    });
  }
  return files.sort((a, b) => b.modified.localeCompare(a.modified));
}

async function metadata(path: string): Promise<FileMetadata | null> {
  const response = await call(`${API}/files/get_metadata`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  if (response.status === 409) return null; // not found
  if (!response.ok) throw await failure(response);
  return (await response.json()) as FileMetadata;
}

/** Downloads a file from the app folder. */
export async function downloadDropboxFile(path: string): Promise<OpenedFile> {
  const response = await call(`${CONTENT}/files/download`, {
    method: 'POST',
    headers: { 'Dropbox-API-Arg': apiArg({ path }) },
  });
  if (!response.ok) throw await failure(response);
  const header = response.headers.get('Dropbox-API-Result');
  const meta = header ? (JSON.parse(header) as FileMetadata) : await metadata(path);
  if (!meta) throw new Error(`${path} was not found in Dropbox.`);
  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    descriptor: { kind: 'dropbox', name: meta.name, path: meta.path_display },
    version: { rev: meta.rev },
  };
}

type WriteMode = { '.tag': 'update'; update: string } | 'add' | 'overwrite';

async function upload(bytes: Uint8Array, path: string, mode: WriteMode): Promise<Response> {
  return call(`${CONTENT}/files/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Dropbox-API-Arg': apiArg({
        path,
        mode,
        autorename: false,
        mute: true,
        strict_conflict: true,
      }),
    },
    body: bytes as Uint8Array<ArrayBuffer>,
  });
}

async function saved(response: Response): Promise<SaveResult> {
  const meta = (await response.json()) as FileMetadata;
  return {
    ok: true,
    version: { rev: meta.rev },
    descriptor: { kind: 'dropbox', name: meta.name, path: meta.path_display },
  };
}

function asFailure(err: unknown): SaveResult {
  return { ok: false, reason: 'failed', message: err instanceof Error ? err.message : String(err) };
}

export const dropboxAdapter: StorageAdapter = {
  kind: 'dropbox',
  capabilities: { writeBack: true },

  // Files are picked in the app's own Dropbox dialog, which calls downloadDropboxFile.
  open: () => Promise.resolve(null),

  async reopen(_handle: unknown, descriptor: SourceDescriptor) {
    if (!descriptor.path) return null;
    return downloadDropboxFile(descriptor.path);
  },

  async peekVersion(_handle: unknown, descriptor: SourceDescriptor): Promise<VersionToken | null> {
    if (!descriptor.path || !dropboxState.getState().connected) return null;
    const meta = await metadata(descriptor.path);
    return meta ? { rev: meta.rev } : null;
  },

  async save(bytes, { descriptor, base, force }) {
    const path = descriptor.path ?? `/${descriptor.name}`;
    try {
      const mode: WriteMode =
        force || !base.rev ? 'overwrite' : { '.tag': 'update', update: base.rev };
      const response = await upload(bytes, path, mode);
      if (response.ok) return await saved(response);
      if (response.status === 409) {
        // Someone else saved a newer revision: hand back theirs to resolve.
        const current = await downloadDropboxFile(path);
        return {
          ok: false,
          reason: 'changed',
          remoteBytes: current.bytes,
          version: current.version,
        };
      }
      throw await failure(response);
    } catch (err) {
      return asFailure(err);
    }
  },

  async saveAs(bytes, suggestedName) {
    try {
      const name = suggestedName.replace(/[/\\]/g, '-');
      const response = await upload(bytes, `/${name}`, 'add');
      if (response.ok) return await saved(response);
      if (response.status === 409) {
        return {
          ok: false,
          reason: 'failed',
          message: `A file named ${name} already exists in Dropbox. Choose another name.`,
        };
      }
      throw await failure(response);
    } catch (err) {
      return asFailure(err);
    }
  },
};
