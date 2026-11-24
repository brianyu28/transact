import { ActionIcon, Button, Tooltip } from '@mantine/core';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import styles from './PeriodNav.module.scss';

interface PeriodNavProps {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  /** Shown when not on the current period. */
  onToday?: (() => void) | undefined;
}

export function PeriodNav({ label, onPrev, onNext, onToday }: PeriodNavProps) {
  return (
    <div className={styles.root}>
      <Tooltip label="Previous ([)">
        <ActionIcon color="gray" onClick={onPrev} aria-label="Previous period">
          <IconChevronLeft size={16} />
        </ActionIcon>
      </Tooltip>
      <h2 className={styles.label}>{label}</h2>
      <Tooltip label="Next (])">
        <ActionIcon color="gray" onClick={onNext} aria-label="Next period">
          <IconChevronRight size={16} />
        </ActionIcon>
      </Tooltip>
      {onToday && (
        <Button size="compact-xs" variant="subtle" onClick={onToday}>
          Current
        </Button>
      )}
    </div>
  );
}
