import { FileMenu } from '@/app/file/FileMenu';
import styles from './TopBar.module.scss';

interface TopBarProps {
  title: string;
}

export function TopBar({ title }: TopBarProps) {
  return (
    <header className={styles.root}>
      <h1 className={styles.title}>{title}</h1>
      <div className={styles.right}>
        <FileMenu />
      </div>
    </header>
  );
}
