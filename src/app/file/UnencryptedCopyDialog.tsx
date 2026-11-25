import { Button, Group, Modal, Stack, Text } from '@mantine/core';
import { displayFileName } from '@/lib/format';
import { useSession } from '@/store/sessionStore';

/**
 * Asks before an unencrypted copy of the open encrypted file is loaded (which turns
 * encryption off) or merged in. Keeping the encrypted version is the default.
 */
export function UnencryptedCopyDialog() {
  const pending = useSession((s) => s.unencryptedCopy);
  const name = displayFileName(pending?.fileName ?? '');
  const merge = pending?.action === 'merge';

  return (
    <Modal
      opened={pending !== null}
      onClose={() => pending?.resolve(false)}
      title="This copy isn’t encrypted"
      size="md"
      centered
    >
      <Stack gap="sm">
        <Text size="sm">
          {name} is encrypted here, but the other copy of it isn’t. If you turned off encryption on
          another device, you can continue. If you didn’t, someone else may have replaced the file.
        </Text>
        <Text size="sm" c="dimmed">
          {merge
            ? 'Merging adds its changes to your file, and they can’t be verified. Your file stays encrypted.'
            : 'Using it replaces what’s open here and turns encryption off for this file.'}
        </Text>
        <Group justify="flex-end" gap="xs">
          <Button variant="light" color="red" onClick={() => pending?.resolve(true)}>
            {merge ? 'Merge anyway' : 'Use unencrypted copy'}
          </Button>
          <Button onClick={() => pending?.resolve(false)} data-autofocus>
            {merge ? 'Don’t merge' : 'Keep encrypted version'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
