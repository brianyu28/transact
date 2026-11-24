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
import type { ComponentType } from 'react';
import { AccountsPage } from '@/features/accounts/AccountsPage';
import { BudgetsPage } from '@/features/budgets/BudgetsPage';
import { HomePage } from '@/features/home/HomePage';
import { PlannerPage } from '@/features/planner/PlannerPage';
import { ReportsPage } from '@/features/reports/ReportsPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { StatementsPage } from '@/features/statements/StatementsPage';
import { TransactionsPage } from '@/features/transactions/TransactionsPage';

export interface AppRoute {
  path: string;
  title: string;
  icon: Icon;
  component: ComponentType;
  /** Shown in the phone bottom navigation (others are reachable from "More"). */
  primary?: boolean;
  /** Usable without an open document (default: requires one). */
  standalone?: boolean;
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
  },
  {
    path: '/accounts',
    title: 'Accounts',
    icon: IconWallet,
    component: AccountsPage,
    primary: true,
  },
  { path: '/statements', title: 'Statements', icon: IconReceipt, component: StatementsPage },
  { path: '/reports', title: 'Reports', icon: IconChartBar, component: ReportsPage },
  { path: '/planner', title: 'Planner', icon: IconCalculator, component: PlannerPage },
  {
    path: '/settings',
    title: 'Settings',
    icon: IconSettings,
    component: SettingsPage,
    standalone: true,
  },
];

export function findRoute(path: string): AppRoute | undefined {
  return routes.find((r) => r.path === path);
}
