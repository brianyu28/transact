// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  decryptFile,
  deriveKey,
  encryptFile,
  randomSalt,
  readEnvelope,
  WrongPassphraseError,
} from './crypto';

const ITER = 1000; // fast for tests; the app uses 600,000

describe('file encryption', () => {
  it('round-trips with the right passphrase and a fresh IV each time', async () => {
    const salt = randomSalt();
    const info = { key: await deriveKey('correct horse', salt, ITER), salt, iterations: ITER };
    const plain = new TextEncoder().encode('{"format":"transact"}');
    const a = await encryptFile(plain, 'fil_abc', info);
    const b = await encryptFile(plain, 'fil_abc', info);
    const envA = readEnvelope(a)!;
    expect(envA.fileId).toBe('fil_abc');
    expect(envA.cipher.iv).not.toBe(readEnvelope(b)!.cipher.iv);
    expect(new TextDecoder().decode(await decryptFile(envA, info.key))).toBe(
      '{"format":"transact"}',
    );
    // A key derived again from the same passphrase and the file's salt works.
    const again = await deriveKey('correct horse', salt, ITER);
    await expect(decryptFile(envA, again)).resolves.toBeDefined();
  });

  it('rejects a wrong passphrase and tampering (including a swapped file id)', async () => {
    const salt = randomSalt();
    const info = { key: await deriveKey('right', salt, ITER), salt, iterations: ITER };
    const env = readEnvelope(await encryptFile(new Uint8Array([1, 2, 3]), 'fil_abc', info))!;
    await expect(decryptFile(env, await deriveKey('wrong', salt, ITER))).rejects.toBeInstanceOf(
      WrongPassphraseError,
    );
    await expect(decryptFile({ ...env, fileId: 'fil_other' }, info.key)).rejects.toBeInstanceOf(
      WrongPassphraseError,
    );
  });

  it('ignores plaintext files', () => {
    expect(
      readEnvelope(new TextEncoder().encode('{"format":"transact","schemaVersion":2}')),
    ).toBeNull();
  });
});
