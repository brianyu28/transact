import { ActionIcon } from '@mantine/core';
import { useLocalStorage } from '@mantine/hooks';
import { IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand } from '@tabler/icons-react';
import { routes } from '@/app/routes';
import { NavItem } from './NavItem';
import styles from './Sidebar.module.scss';

/** Device-local preference (not stored in the data file). */
const COLLAPSED_KEY = 'transact:sidebar-collapsed';

/**
 * Desktop sidebar. Can be collapsed to an icon rail to give content more room;
 * on tablet it is always a rail, and on phone it's replaced by the bottom nav.
 */
export function Sidebar() {
  const [collapsed, setCollapsed] = useLocalStorage({
    key: COLLAPSED_KEY,
    defaultValue: false,
    getInitialValueInEffect: false,
  });
  const ToggleIcon = collapsed ? IconLayoutSidebarLeftExpand : IconLayoutSidebarLeftCollapse;
  const toggleLabel = collapsed ? 'Expand sidebar' : 'Collapse sidebar';

  return (
    <nav className={styles.root} aria-label="Main" data-collapsed={collapsed || undefined}>
      <div className={styles.brand}>
        <img src="favicon.svg" alt="" className={styles.logo} />
        <span className={styles.name}>Transact</span>
      </div>
      <div className={styles.items}>
        {routes.map((route) => (
          <NavItem key={route.path} route={route} variant="sidebar" />
        ))}
      </div>
      <div className={styles.footer}>
        <ActionIcon
          className={styles.toggle}
          color="gray"
          onClick={() => {
            setCollapsed(!collapsed);
          }}
          aria-label={toggleLabel}
          aria-pressed={collapsed}
          title={toggleLabel}
        >
          <ToggleIcon size={16} stroke={1.75} />
        </ActionIcon>
      </div>
    </nav>
  );
}
