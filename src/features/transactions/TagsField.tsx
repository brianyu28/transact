import { Popover, TagsInput, UnstyledButton } from '@mantine/core';
import { IconTag } from '@tabler/icons-react';
import { useState } from 'react';
import styles from './TagsField.module.scss';

interface TagsFieldProps {
  value: string[];
  options: string[];
  onChange: (value: string[]) => void;
  /** Label for the stacked (phone) layout. */
  label?: string;
  /** Compact: a one-line summary that opens a popover; otherwise a plain tags input. */
  compact: boolean;
}

/** Tag editor that stays one line tall in the register, however many tags there are. */
export function TagsField({ value, options, onChange, label, compact }: TagsFieldProps) {
  const [opened, setOpened] = useState(false);

  if (!compact) {
    return (
      <TagsInput
        label={label}
        data={options}
        value={value}
        onChange={onChange}
        acceptValueOnBlur
        size="xs"
      />
    );
  }

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      position="bottom-start"
      width={260}
      trapFocus
      shadow="md"
    >
      <Popover.Target>
        <UnstyledButton
          className={styles.summary}
          aria-label={value.length ? `Tags: ${value.join(', ')}` : 'Add tags'}
          onClick={() => {
            setOpened((o) => !o);
          }}
        >
          <IconTag size={12} className={styles.icon} />
          {value.length ? (
            <span className={styles.names}>{value.join(', ')}</span>
          ) : (
            <span className={styles.placeholder}>Tags</span>
          )}
        </UnstyledButton>
      </Popover.Target>
      <Popover.Dropdown p={6}>
        <TagsInput
          data-autofocus
          size="xs"
          placeholder="Type a tag, Enter to add"
          data={options}
          value={value}
          onChange={onChange}
          acceptValueOnBlur
          comboboxProps={{ withinPortal: false }}
          aria-label="Tags"
        />
      </Popover.Dropdown>
    </Popover>
  );
}
