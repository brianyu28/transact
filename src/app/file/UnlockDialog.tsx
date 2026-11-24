import { Button, Checkbox, Group, Modal, PasswordInput, Stack, Text } from '@mantine/core';
import { useState } from 'react';
import { displayFileName } from '@/lib/format';
import { session, useSession } from '@/store/sessionStore';

/** Asks for the passphrase of an encrypted file. */
export function UnlockDialog() {
  const locked = useSession((s) => s.locked);
  const [passphrase, setPassphrase] = useState('');
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const unlock = async () => {
    if (!passphrase) return;
    setBusy(true);
    setError(null);
    try {
      await session.unlock(passphrase, remember);
      setPassphrase('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      opened={locked !== null}
      onClose={() => {
        setPassphrase('');
        setError(null);
        session.cancelUnlock();
      }}
      title="Unlock file"
      size="sm"
      centered
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void unlock();
        }}
      >
        <Stack gap="sm">
          <Text size="sm">
            {displayFileName(locked?.fileName ?? '')} is encrypted. Enter its passphrase to open it.
          </Text>
          <PasswordInput
            label="Passphrase"
            value={passphrase}
            onChange={(e) => {
              setPassphrase(e.currentTarget.value);
              setError(null);
            }}
            error={error}
            autoFocus
            data-autofocus
          />
          <Checkbox
            label="Remember on this device"
            description="Keeps a key in this browser so you aren’t asked again. Don’t use on shared devices."
            checked={remember}
            onChange={(e) => {
              setRemember(e.currentTarget.checked);
            }}
          />
          <Group justify="flex-end" gap="xs">
            <Button
              variant="default"
              onClick={() => {
                session.cancelUnlock();
              }}
            >
              Cancel
            </Button>
            <Button type="submit" loading={busy} disabled={!passphrase}>
              Unlock
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
