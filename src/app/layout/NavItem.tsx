import { clsx } from 'clsx';
import { Link, useLocation } from 'wouter';
import type { AppRoute } from '@/app/routes';
import styles from './NavItem.module.scss';

interface NavItemProps {
  route: AppRoute;
  variant: 'sidebar' | 'bottom';
}

export function NavItem({ route, variant }: NavItemProps) {
  const [location] = useLocation();
  const active = location === route.path;
  const Icon = route.icon;
  return (
    <Link
      href={route.path}
      className={clsx(styles.item, styles[variant], active && styles.active)}
      aria-current={active ? 'page' : undefined}
      title={route.title}
    >
      <Icon className={styles.icon} stroke={1.75} aria-hidden />
      <span className={styles.label}>{route.title}</span>
    </Link>
  );
}
