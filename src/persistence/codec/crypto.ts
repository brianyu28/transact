/**
 * Optional encryption of data files with a passphrase, using WebCrypto only.
 *
 * An encrypted file is a small JSON envelope around the ordinary (plaintext) file bytes:
 *   { format: "transact-encrypted", envelopeVersion: 1, fileId,
 *     kdf: { name: "PBKDF2", hash: "SHA-256", iterations, salt },
 *     cipher: { name: "AES-GCM", iv }, payload }
 * - The key is derived from the passphrase with PBKDF2 (salt fixed per file, so a key
 *   remembered on a device keeps working); every save uses a fresh random IV.
 * - AES-GCM authenticates the data: a wrong passphrase or any tampering fails to decrypt.
 * - The file id is authenticated too (as additional data), so it can be used in clear to
 *   find a remembered key without being swappable.
 * - The schema version lives inside the encrypted payload; `envelopeVersion` versions
 *   only this wrapper (e.g. a future move to Argon2).
 */
import { ENCRYPTED_FORMAT } from '@/domain/schema/version';

export const DEFAULT_ITERATIONS = 600_000;
const MIN_ITERATIONS = 1_000;
const MAX_ITERATIONS = 10_000_000;

export interface EncryptionInfo {
  key: CryptoKey;
  salt: Uint8Array;
  iterations: number;
}

export interface Envelope {
  format: typeof ENCRYPTED_FORMAT;
  /** Typed loosely: envelopes are read from files and checked before use. */
  envelopeVersion: number;
  fileId: string;
  kdf: { name: string; hash: string; iterations: number; salt: string };
  cipher: { name: string; iv: string };
  payload: string;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

const aad = (fileId: string) => encoder.encode(`${ENCRYPTED_FORMAT}:1:${fileId}`);

export function randomSalt(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(16));
}

/** Derives a non-extractable AES-GCM key (scripts can use it but never read it out). */
export async function deriveKey(
  passphrase: string,
  salt: Uint8Array,
  iterations = DEFAULT_ITERATIONS,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as Uint8Array<ArrayBuffer>, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptFile(
  plaintext: Uint8Array,
  fileId: string,
  info: EncryptionInfo,
): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aad(fileId) },
    info.key,
    plaintext as Uint8Array<ArrayBuffer>,
  );
  const envelope: Envelope = {
    format: ENCRYPTED_FORMAT,
    envelopeVersion: 1,
    fileId,
    kdf: {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations: info.iterations,
      salt: toBase64(info.salt),
    },
    cipher: { name: 'AES-GCM', iv: toBase64(iv) },
    payload: toBase64(new Uint8Array(ciphertext)),
  };
  return encoder.encode(JSON.stringify(envelope, null, 1) + '\n');
}

/** The envelope if these bytes are an encrypted Transact file, else null. */
export function readEnvelope(bytes: Uint8Array): Envelope | null {
  // Cheap check before parsing: encrypted files are small JSON starting with the format.
  const head = decoder.decode(bytes.subarray(0, 200));
  if (!head.includes(ENCRYPTED_FORMAT)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoder.decode(bytes));
  } catch {
    return null;
  }
  if (!isRecord(parsed) || parsed.format !== ENCRYPTED_FORMAT) return null;
  // The envelope comes from an untrusted file: check its shape before using any of it.
  const { kdf, cipher } = parsed;
  const valid =
    typeof parsed.envelopeVersion === 'number' &&
    typeof parsed.fileId === 'string' &&
    typeof parsed.payload === 'string' &&
    isRecord(kdf) &&
    typeof kdf.name === 'string' &&
    typeof kdf.hash === 'string' &&
    typeof kdf.salt === 'string' &&
    Number.isInteger(kdf.iterations) &&
    // Bounded so a crafted file can't freeze the tab deriving a key.
    (kdf.iterations as number) >= MIN_ITERATIONS &&
    (kdf.iterations as number) <= MAX_ITERATIONS &&
    isRecord(cipher) &&
    typeof cipher.name === 'string' &&
    typeof cipher.iv === 'string';
  if (!valid) throw new Error('This encrypted file is damaged or wasn’t written by Transact.');
  return parsed as unknown as Envelope;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function envelopeSalt(envelope: Envelope): Uint8Array<ArrayBuffer> {
  return fromBase64(envelope.kdf.salt);
}

export class WrongPassphraseError extends Error {
  constructor() {
    super('That passphrase doesn’t unlock this file.');
    this.name = 'WrongPassphraseError';
  }
}

/** Decrypts an envelope; throws WrongPassphraseError for a wrong key or tampered data. */
export async function decryptFile(envelope: Envelope, key: CryptoKey): Promise<Uint8Array> {
  if (
    envelope.envelopeVersion !== 1 ||
    envelope.cipher.name !== 'AES-GCM' ||
    envelope.kdf.name !== 'PBKDF2'
  ) {
    throw new Error('This file was encrypted by a newer version of Transact.');
  }
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(envelope.cipher.iv), additionalData: aad(envelope.fileId) },
      key,
      fromBase64(envelope.payload),
    );
    return new Uint8Array(plain);
  } catch {
    throw new WrongPassphraseError();
  }
}
