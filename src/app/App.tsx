import '@fontsource-variable/inter';
import '@mantine/core/styles.layer.css';
import '@/styles/global.scss';

import { MantineProvider } from '@mantine/core';
import { Suspense, type ReactNode } from 'react';
import { Route, Router, Switch } from 'wouter';
import { useHashLocation } from 'wouter/use-hash-location';
import { Toaster } from '@/components/Toaster/Toaster';
import { ConflictDialog } from './file/ConflictDialog';
import { UnencryptedCopyDialog } from './file/UnencryptedCopyDialog';
import { UnlockDialog } from './file/UnlockDialog';
import { DropboxDialog } from './file/DropboxDialog';
import { PrefsEffects } from './PrefsEffects';
import { DocumentGate } from './file/DocumentGate';
import { AppLayout } from './layout/AppLayout';
import { CommandPalette } from '@/keyboard/CommandPalette';
import { GlobalCommands } from '@/keyboard/GlobalCommands';
import { ShortcutHelp } from '@/keyboard/ShortcutHelp';
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
          {routes.map(({ path, match, title, component: Page, standalone }) => (
            <Route key={path} path={match ?? path}>
              <AppLayout title={title}>
                <Suspense fallback={null}>
                  {standalone ? (
                    <Page />
                  ) : (
                    <DocumentGate>
                      <Page />
                    </DocumentGate>
                  )}
                </Suspense>
              </AppLayout>
            </Route>
          ))}
          <Route>
            <AppLayout title="Not found">
              <p style={{ padding: 16 }}>This page doesn’t exist.</p>
            </AppLayout>
          </Route>
        </Switch>
        <GlobalCommands />
        <ShortcutHelp />
      </Router>
      <ConflictDialog />
      <UnlockDialog />
      <UnencryptedCopyDialog />
      <DropboxDialog />
      <CommandPalette />
      <Toaster />
      <PrefsEffects />
      {children}
    </MantineProvider>
  );
}
