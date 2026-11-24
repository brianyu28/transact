import { IconFile } from '@tabler/icons-react';
import styles from './TopBar.module.scss';

interface TopBarProps {
  title: string;
}

export function TopBar({ title }: TopBarProps) {
  return (
    <header className={styles.root}>
      <h1 className={styles.title}>{title}</h1>
      <div className={styles.status}>
        <IconFile size={14} stroke={1.75} aria-hidden />
        <span>No file open</span>
      </div>
    </header>
  );
}
