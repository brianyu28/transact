import type { ReactNode } from 'react';
import { NoticeBar } from '@/app/file/NoticeBar';
import { BottomNav } from './BottomNav';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import styles from './AppLayout.module.scss';

interface AppLayoutProps {
  title: string;
  children: ReactNode;
}

/**
 * Responsive shell: sidebar on desktop (icon rail on tablet), bottom tabs on phone.
 * Layout switches are pure CSS so there's no flash or re-render on resize.
 */
export function AppLayout({ title, children }: AppLayoutProps) {
  return (
    <div className={styles.root}>
      <Sidebar />
      <div className={styles.column}>
        <TopBar title={title} />
        <NoticeBar />
        <main className={styles.main}>{children}</main>
        <BottomNav />
      </div>
    </div>
  );
}
