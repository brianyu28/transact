import { Menu, UnstyledButton } from '@mantine/core';
import { IconDots } from '@tabler/icons-react';
import { useLocation } from 'wouter';
import { routes } from '@/app/routes';
import { NavItem } from './NavItem';
import styles from './BottomNav.module.scss';

const primary = routes.filter((r) => r.primary);
const secondary = routes.filter((r) => !r.primary);

/** Phone-only tab bar: primary screens as tabs, the rest under "More". */
export function BottomNav() {
  const [location, navigate] = useLocation();
  const moreActive = secondary.some((r) => r.path === location);
  return (
    <nav className={styles.root} aria-label="Main">
      {primary.map((route) => (
        <NavItem key={route.path} route={route} variant="bottom" />
      ))}
      <Menu position="top-end" offset={4}>
        <Menu.Target>
          <UnstyledButton className={styles.more} data-active={moreActive || undefined}>
            <IconDots className={styles.icon} stroke={1.75} aria-hidden />
            <span>More</span>
          </UnstyledButton>
        </Menu.Target>
        <Menu.Dropdown>
          {secondary.map((route) => {
            const Icon = route.icon;
            return (
              <Menu.Item
                key={route.path}
                leftSection={<Icon size={16} stroke={1.75} />}
                onClick={() => {
                  navigate(route.path);
                }}
              >
                {route.title}
              </Menu.Item>
            );
          })}
        </Menu.Dropdown>
      </Menu>
    </nav>
  );
}
