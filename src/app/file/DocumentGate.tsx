import type { ReactNode } from 'react';
import { useSession } from '@/store/sessionStore';
import { WelcomeScreen } from './WelcomeScreen';

/** Renders its children only when a document is open; otherwise the welcome screen. */
export function DocumentGate({ children }: { children: ReactNode }) {
  const ready = useSession((s) => s.status === 'ready');
  return ready ? children : <WelcomeScreen />;
}
