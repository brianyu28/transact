import { Button, Group, Modal, Text } from '@mantine/core';
import { useState, type ReactNode } from 'react';
import { docStore, selectIsDirty } from '@/store/docStore';
import { session } from '@/store/sessionStore';

/**
 * Wraps actions that replace the open document (new, open, close) so the user is asked
 * before unsaved changes are discarded. Returns the guard and the modal to render.
 */
export function useDiscardGuard(): [(action: () => unknown) => void, ReactNode] {
  const [pending, setPending] = useState<(() => unknown) | null>(null);

  const guard = (action: () => unknown) => {
    if (selectIsDirty(docStore.getState())) setPending(() => action);
    else void action();
  };

  const close = () => {
    setPending(null);
  };
  const run = async (saveFirst: boolean) => {
    const action = pending;
    close();
    if (saveFirst) {
      await session.save();
      if (selectIsDirty(docStore.getState())) return; // save cancelled or failed
    }
    await action?.();
  };

  const modal = (
    <Modal opened={pending !== null} onClose={close} title="Unsaved changes" size="sm" centered>
      <Text size="sm" mb="md">
        The open file has changes that haven’t been saved to disk.
      </Text>
      <Group justify="flex-end" gap="xs">
        <Button variant="default" onClick={close}>
          Cancel
        </Button>
        <Button variant="light" color="red" onClick={() => void run(false)}>
          Discard
        </Button>
        <Button onClick={() => void run(true)}>Save first</Button>
      </Group>
    </Modal>
  );

  return [guard, modal];
}
