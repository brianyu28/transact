import { Alert, Anchor } from '@mantine/core';
import { IconAlertTriangle, IconHistory, IconInfoCircle } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { formatRelativeTime, pluralize } from '@/lib/format';
import { downloadAdapter } from '@/persistence/adapters/download';
import { session, useSession, type Notice } from '@/store/sessionStore';
import styles from './NoticeBar.module.scss';

function render(notice: Notice): {
  color: string;
  icon: ReactNode;
  title: string;
  body: ReactNode;
} {
  switch (notice.kind) {
    case 'restored':
      return {
        color: 'accent',
        icon: <IconHistory size={16} />,
        title: 'Restored unsaved changes',
        body: `Your edits from ${formatRelativeTime(notice.updatedAt)} were kept in this browser. Save to write them to your file.`,
      };
    case 'migrated': {
      const backupName =
        notice.fileName.replace(/\.json$/i, '') + `.v${notice.fromVersion}-backup.json`;
      return {
        color: 'accent',
        icon: <IconInfoCircle size={16} />,
        title: 'File upgraded',
        body: (
          <>
            This file was upgraded from schema version {notice.fromVersion}. Saving will write the
            new format.{' '}
            <Anchor
              component="button"
              size="sm"
              onClick={() => void downloadAdapter.saveAs(notice.originalBytes, backupName)}
            >
              Download a backup of the original
            </Anchor>
          </>
        ),
      };
    }
    case 'integrity':
      return {
        color: 'yellow',
        icon: <IconAlertTriangle size={16} />,
        title: `This file has ${pluralize(notice.issues.length, 'data issue')}`,
        body: (
          <ul className={styles.list}>
            {notice.issues.slice(0, 5).map((issue, i) => (
              <li key={i}>
                {issue.entityId}: {issue.message}
              </li>
            ))}
            {notice.issues.length > 5 && <li>…and {notice.issues.length - 5} more</li>}
          </ul>
        ),
      };
    case 'error':
      return {
        color: 'red',
        icon: <IconAlertTriangle size={16} />,
        title: notice.title,
        body: <span className={styles.preLine}>{notice.message}</span>,
      };
  }
}

/** Dismissible notices about the open file (restored edits, upgrades, errors). */
export function NoticeBar() {
  const notices = useSession((s) => s.notices);
  if (notices.length === 0) return null;
  return (
    <div className={styles.root}>
      {notices.map((notice) => {
        const { color, icon, title, body } = render(notice);
        return (
          <Alert
            key={notice.kind}
            color={color}
            variant="light"
            icon={icon}
            title={title}
            withCloseButton
            onClose={() => {
              session.dismissNotice(notice.kind);
            }}
            classNames={{ root: styles.alert }}
          >
            {body}
          </Alert>
        );
      })}
    </div>
  );
}
