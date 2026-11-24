import { Alert, Button, Checkbox, Group, Modal, PasswordInput, Stack, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useState } from 'react';
import { session, useSession } from '@/store/sessionStore';
import { toast } from '@/store/toastStore';
import styles from './StorageSettings.module.scss';

const MIN_LENGTH = 8;

/** Turns passphrase encryption on or off for the open file, or changes the passphrase. */
export function EncryptionSettings() {
  const encrypted = useSession((s) => s.encryption !== null);
  const hasDocument = useSession((s) => s.status === 'ready');
  const [editing, { open, close }] = useDisclosure(false);
  const [confirmingOff, offDialog] = useDisclosure(false);
  if (!hasDocument) return null;

  return (
    <>
      <dl className={styles.grid}>
        <dt>Encryption</dt>
        <dd>
          {encrypted
            ? 'On. The file is encrypted with AES-256 using your passphrase.'
            : 'Off. Anyone who can read the file can read your data.'}
        </dd>
      </dl>
      <Group gap="xs" mb="md">
        <Button variant="light" onClick={open}>
          {encrypted ? 'Change passphrase…' : 'Encrypt with a passphrase…'}
        </Button>
        {encrypted && (
          <>
            <Button
              variant="default"
              onClick={() =>
                void session.forgetKey().then(() => {
                  toast('This device will ask for the passphrase next time.');
                })
              }
            >
              Forget key on this device
            </Button>
            <Button variant="default" onClick={offDialog.open}>
              Turn off encryption…
            </Button>
          </>
        )}
      </Group>
      <PassphraseDialog opened={editing} onClose={close} changing={encrypted} />
      <Modal
        opened={confirmingOff}
        onClose={offDialog.close}
        title="Turn off encryption?"
        size="sm"
        centered
      >
        <Text size="sm" mb="md">
          The next save writes the file unencrypted, readable by anyone who can open it.
        </Text>
        <Group justify="flex-end" gap="xs">
          <Button variant="default" onClick={offDialog.close}>
            Cancel
          </Button>
          <Button
            color="red"
            onClick={() => {
              offDialog.close();
              void session.disableEncryption();
            }}
          >
            Turn off
          </Button>
        </Group>
      </Modal>
    </>
  );
}

function PassphraseDialog({
  opened,
  onClose,
  changing,
}: {
  opened: boolean;
  onClose: () => void;
  changing: boolean;
}) {
  const [passphrase, setPassphrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);

  const tooShort = passphrase.length > 0 && passphrase.length < MIN_LENGTH;
  const mismatch = confirm.length > 0 && confirm !== passphrase;
  const valid = passphrase.length >= MIN_LENGTH && confirm === passphrase;

  const done = () => {
    setPassphrase('');
    setConfirm('');
    onClose();
  };

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    try {
      await session.setPassphrase(passphrase, remember);
      done();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={done}
      title={changing ? 'Change passphrase' : 'Encrypt with a passphrase'}
      size="sm"
      centered
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Stack gap="sm">
          <Alert color="yellow" variant="light" icon={<IconAlertTriangle size={16} />} p="xs">
            If you forget the passphrase, the file can’t be recovered. Nobody can reset it.
          </Alert>
          <PasswordInput
            label="Passphrase"
            value={passphrase}
            onChange={(e) => {
              setPassphrase(e.currentTarget.value);
            }}
            error={tooShort ? `Use at least ${MIN_LENGTH} characters.` : undefined}
            data-autofocus
          />
          <PasswordInput
            label="Confirm passphrase"
            value={confirm}
            onChange={(e) => {
              setConfirm(e.currentTarget.value);
            }}
            error={mismatch ? 'The passphrases don’t match.' : undefined}
          />
          <Checkbox
            label="Remember on this device"
            checked={remember}
            onChange={(e) => {
              setRemember(e.currentTarget.checked);
            }}
          />
          <Group justify="flex-end" gap="xs">
            <Button variant="default" onClick={done}>
              Cancel
            </Button>
            <Button type="submit" disabled={!valid} loading={busy}>
              {changing ? 'Change passphrase' : 'Encrypt'}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
