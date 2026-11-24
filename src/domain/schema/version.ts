/** Identifies a Transact data file (plaintext). */
export const FILE_FORMAT = 'transact';
/** Identifies an encrypted Transact envelope (see local plan §5.2; not yet supported). */
export const ENCRYPTED_FORMAT = 'transact-encrypted';

/**
 * The schema version this build reads and writes. Bump it together with a new
 * migration in `migrations/` and a fixture in `fixtures/`.
 */
export const CURRENT_SCHEMA_VERSION = 1;
