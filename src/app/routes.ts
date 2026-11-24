import {
  IconChartBar,
  IconCalculator,
  IconHome,
  IconListDetails,
  IconReceipt,
  IconSettings,
  IconTargetArrow,
  IconWallet,
  type Icon,
} from '@tabler/icons-react';
import { lazy, type ComponentType } from 'react';

// Screens load on demand, keeping the initial bundle small.
const AccountsPage = lazy(() =>
  import('@/features/accounts/AccountsPage').then((m) => ({ default: m.AccountsPage })),
);
const BudgetsPage = lazy(() =>
  import('@/features/budgets/BudgetsPage').then((m) => ({ default: m.BudgetsPage })),
);
const HomePage = lazy(() =>
  import('@/features/home/HomePage').then((m) => ({ default: m.HomePage })),
);
const PlannerPage = lazy(() =>
  import('@/features/planner/PlannerPage').then((m) => ({ default: m.PlannerPage })),
);
const ReportsPage = lazy(() =>
  import('@/features/reports/ReportsPage').then((m) => ({ default: m.ReportsPage })),
);
const SettingsPage = lazy(() =>
  import('@/features/settings/SettingsPage').then((m) => ({ default: m.SettingsPage })),
);
const StatementsPage = lazy(() =>
  import('@/features/statements/StatementsPage').then((m) => ({ default: m.StatementsPage })),
);
const TransactionsPage = lazy(() =>
  import('@/features/transactions/TransactionsPage').then((m) => ({ default: m.TransactionsPage })),
);

export interface AppRoute {
  path: string;
  title: string;
  icon: Icon;
  component: ComponentType;
  /** Shown in the phone bottom navigation (others are reachable from "More"). */
  primary?: boolean;
  /** Usable without an open document (default: requires one). */
  standalone?: boolean;
  /** Route pattern when it differs from `path` (e.g. to accept sub-paths). */
  match?: string;
}

/** Single source of truth for navigation: drives the router, sidebar and bottom nav. */
export const routes: readonly AppRoute[] = [
  { path: '/', title: 'Home', icon: IconHome, component: HomePage, primary: true },
  {
    path: '/transactions',
    title: 'Transactions',
    icon: IconListDetails,
    component: TransactionsPage,
    primary: true,
  },
  {
    path: '/budgets',
    title: 'Budgets',
    icon: IconTargetArrow,
    component: BudgetsPage,
    primary: true,
    match: '/budgets/:tab?',
  },
  {
    path: '/accounts',
    title: 'Accounts',
    icon: IconWallet,
    component: AccountsPage,
    primary: true,
    match: '/accounts/:id?',
  },
  {
    path: '/statements',
    title: 'Statements',
    icon: IconReceipt,
    component: StatementsPage,
    match: '/statements/:id?',
  },
  {
    path: '/reports',
    title: 'Reports',
    icon: IconChartBar,
    component: ReportsPage,
    match: '/reports/:tab?',
  },
  { path: '/planner', title: 'Planner', icon: IconCalculator, component: PlannerPage },
  {
    path: '/settings',
    title: 'Settings',
    icon: IconSettings,
    component: SettingsPage,
    standalone: true,
    match: '/settings/:section?',
  },
];

export function findRoute(path: string): AppRoute | undefined {
  return routes.find((r) => r.path === path);
}
