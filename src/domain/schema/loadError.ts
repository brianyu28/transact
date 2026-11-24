/** Load failures, kept separate from the loader so the UI can describe them without pulling in zod. */
export type LoadError =
  | { kind: 'invalid-json'; message: string }
  | { kind: 'not-transact' }
  | { kind: 'encrypted' }
  | { kind: 'newer-version'; fileVersion: number; supportedVersion: number }
  | { kind: 'migration-failed'; message: string }
  | { kind: 'invalid-schema'; issues: string[] };

export function describeLoadError(error: LoadError): string {
  switch (error.kind) {
    case 'invalid-json':
      return `The file isn't valid JSON (${error.message}).`;
    case 'not-transact':
      return "This doesn't look like a Transact data file.";
    case 'encrypted':
      return "This file is encrypted and couldn't be decrypted.";
    case 'newer-version':
      return `This file uses schema version ${error.fileVersion}, but this version of Transact supports up to ${error.supportedVersion}. Update the app to open it.`;
    case 'migration-failed':
      return `The file couldn't be upgraded to the current format: ${error.message}`;
    case 'invalid-schema':
      return `The file has invalid data:\n${error.issues.join('\n')}`;
  }
}
