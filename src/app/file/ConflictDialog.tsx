import { Button, Group, Modal, Stack, Text } from '@mantine/core';
import { displayFileName, formatRelativeTime } from '@/lib/format';
import { session, useSession } from '@/store/sessionStore';

/** Shown when the file was changed elsewhere while there are local edits. */
export function ConflictDialog() {
  const conflict = useSession((s) => s.conflict);
  const name = useSession((s) => (s.source ? displayFileName(s.source.name) : 'this file'));

  const when = conflict?.remoteSavedAt ? ` ${formatRelativeTime(conflict.remoteSavedAt)}` : '';
  return (
    <Modal
      opened={conflict !== null}
      onClose={() => undefined}
      withCloseButton={false}
      closeOnClickOutside={false}
      closeOnEscape={false}
      title="The file was changed elsewhere"
      size="md"
      centered
    >
      <Stack gap="sm">
        <Text size="sm">
          {name} was saved from another device or app{when} (revision{' '}
          {conflict?.remoteRevision ?? '?'}), but you also have changes here.
        </Text>
        <Text size="sm" c="dimmed">
          Merging keeps both sets of changes. Where the same item was edited on both sides, your
          edit wins and the merge lists it.
        </Text>
        <Button fullWidth onClick={() => void session.resolveConflict('merge')} data-autofocus>
          Merge both (recommended)
        </Button>
        <Group justify="space-between" gap="xs" wrap="nowrap">
          <Text size="xs" c="dimmed">
            Or:
          </Text>
          <Group gap="xs" wrap="nowrap">
            <Button
              size="compact-sm"
              variant="default"
              onClick={() => void session.resolveConflict('keep-mine')}
            >
              Keep only mine
            </Button>
            <Button
              size="compact-sm"
              variant="default"
              onClick={() => void session.resolveConflict('save-copy')}
            >
              Save mine as a copy
            </Button>
            <Button
              size="compact-sm"
              variant="light"
              color="red"
              onClick={() => void session.resolveConflict('take-theirs')}
            >
              Use theirs
            </Button>
          </Group>
        </Group>
      </Stack>
    </Modal>
  );
}
