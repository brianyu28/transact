import '@fontsource-variable/inter';
import '@mantine/core/styles.layer.css';
import '@/styles/global.scss';

import { MantineProvider } from '@mantine/core';
import type { ReactNode } from 'react';
import { Route, Router, Switch } from 'wouter';
import { useHashLocation } from 'wouter/use-hash-location';
import { ConflictDialog } from './file/ConflictDialog';
import { DocumentGate } from './file/DocumentGate';
import { FileShortcuts } from './file/FileShortcuts';
import { AppLayout } from './layout/AppLayout';
import { routes } from './routes';
import { theme } from './theme';

interface AppProps {
  /** Extra top-level UI rendered inside the providers (e.g. the PWA update prompt). */
  children?: ReactNode;
}

/**
 * Root component. Hash-based routing keeps the app working on any static host
 * without server rewrite rules.
 */
export function App({ children }: AppProps) {
  return (
    <MantineProvider theme={theme} defaultColorScheme="auto">
      <Router hook={useHashLocation}>
        <Switch>
          {routes.map(({ path, title, component: Page, standalone }) => (
            <Route key={path} path={path}>
              <AppLayout title={title}>
                {standalone ? (
                  <Page />
                ) : (
                  <DocumentGate>
                    <Page />
                  </DocumentGate>
                )}
              </AppLayout>
            </Route>
          ))}
          <Route>
            <AppLayout title="Not found">
              <p style={{ padding: 16 }}>This page doesn’t exist.</p>
            </AppLayout>
          </Route>
        </Switch>
      </Router>
      <ConflictDialog />
      <FileShortcuts />
      {children}
    </MantineProvider>
  );
}
