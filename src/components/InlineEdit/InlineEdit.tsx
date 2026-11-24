import { TextInput } from '@mantine/core';
import { clsx } from 'clsx';
import { useState } from 'react';
import styles from './InlineEdit.module.scss';

interface InlineEditProps {
  value: string;
  onCommit: (value: string) => void;
  /** Accessible label for the input. */
  label: string;
  className?: string | undefined;
}

/** Text that turns into an input on click (or Enter); Enter/blur commits, Escape cancels. */
export function InlineEdit({ value, onCommit, label, className }: InlineEditProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (!editing) {
    return (
      <button
        type="button"
        className={clsx(styles.display, className)}
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        title="Click to rename"
      >
        {value}
      </button>
    );
  }

  const commit = () => {
    setEditing(false);
    if (draft.trim() && draft.trim() !== value) onCommit(draft.trim());
  };

  return (
    <TextInput
      autoFocus
      size="xs"
      aria-label={label}
      value={draft}
      onChange={(e) => {
        setDraft(e.currentTarget.value);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') setEditing(false);
      }}
      classNames={{ root: styles.input }}
    />
  );
}
