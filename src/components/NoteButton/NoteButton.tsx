import { ActionIcon, Button, Group, Modal, Textarea, Tooltip } from '@mantine/core';
import { IconNote } from '@tabler/icons-react';
import { clsx } from 'clsx';
import { useState } from 'react';
import styles from './NoteButton.module.scss';

interface NoteButtonProps {
  note: string | undefined;
  /** What the note is about, e.g. "Food" (used in the title and labels). */
  subject: string;
  onSave: (note: string) => void;
  /** Show a labeled button ("Add note") instead of a bare icon, e.g. in a sheet. */
  labeled?: boolean;
  className?: string;
}

/**
 * A small note icon that opens an editor. Highlighted when there is a note; otherwise it
 * shows only on row hover/focus (see `.reveal` in the row's styles), keeping rows uncluttered.
 */
export function NoteButton({ note, subject, onSave, labeled, className }: NoteButtonProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const has = Boolean(note);
  const close = () => {
    setDraft(null);
  };
  return (
    <>
      {labeled ? (
        <Button
          size="xs"
          variant="default"
          leftSection={<IconNote size={14} />}
          className={className}
          onClick={() => {
            setDraft(note ?? '');
          }}
        >
          {has ? 'Edit note' : 'Add note'}
        </Button>
      ) : (
        <Tooltip label={has ? note : 'Add a note'} multiline maw={320} openDelay={300}>
          <ActionIcon
            size="sm"
            variant="subtle"
            color={has ? 'accent' : 'gray'}
            aria-label={has ? `Note for ${subject}` : `Add a note for ${subject}`}
            className={clsx(styles.button, !has && styles.empty, className)}
            onClick={(e) => {
              e.stopPropagation();
              setDraft(note ?? '');
            }}
          >
            <IconNote size={14} />
          </ActionIcon>
        </Tooltip>
      )}
      <Modal opened={draft !== null} onClose={close} title={`Note · ${subject}`} size="md">
        <Textarea
          data-autofocus
          autosize
          minRows={4}
          maxRows={14}
          maxLength={10_000}
          aria-label={`Note for ${subject}`}
          value={draft ?? ''}
          onChange={(e) => {
            setDraft(e.currentTarget.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              onSave(draft ?? '');
              close();
            }
          }}
        />
        <Group justify="space-between" mt="sm">
          {has ? (
            <Button
              variant="subtle"
              color="red"
              size="xs"
              onClick={() => {
                onSave('');
                close();
              }}
            >
              Delete note
            </Button>
          ) : (
            <span />
          )}
          <Group gap="xs">
            <Button variant="default" size="xs" onClick={close}>
              Cancel
            </Button>
            <Button
              size="xs"
              onClick={() => {
                if ((draft ?? '').trim() !== (note ?? '')) onSave(draft ?? '');
                close();
              }}
            >
              Save
            </Button>
          </Group>
        </Group>
      </Modal>
    </>
  );
}
