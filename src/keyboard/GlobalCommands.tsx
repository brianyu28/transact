import { useLocation } from 'wouter';
import { useDiscardGuard } from '@/app/file/useDiscardGuard';
import { docStore } from '@/store/docStore';
import { prefsStore } from '@/store/prefsStore';
import { session, sessionStore } from '@/store/sessionStore';
import { uiStore } from '@/store/uiStore';
import { useCommandHandlers } from './useCommandHandlers';
import { installKeyboard } from './registry';
import { useEffect } from 'react';

const hasDoc = () => docStore.getState().doc !== null;

/** App-wide command handlers (navigation, file, undo/redo, palette, help). */
export function GlobalCommands() {
  const [, navigate] = useLocation();
  const [guard, discardModal] = useDiscardGuard();

  useEffect(() => installKeyboard(), []);

  const go = (path: string) => ({
    run: () => {
      navigate(path);
    },
  });

  useCommandHandlers({
    'app.palette': {
      run: () => {
        uiStore.setState({ paletteOpen: true, helpOpen: false });
      },
    },
    'app.help': {
      run: () => {
        uiStore.setState({ helpOpen: true, paletteOpen: false });
      },
    },
    'app.toggleSidebar': {
      run: () => {
        const { sidebarCollapsed, setPref } = prefsStore.getState();
        setPref('sidebarCollapsed', !sidebarCollapsed);
      },
    },
    'nav.home': go('/'),
    'nav.transactions': go('/transactions'),
    'nav.budgets': go('/budgets'),
    'nav.accounts': go('/accounts'),
    'nav.statements': go('/statements'),
    'nav.reports': go('/reports'),
    'nav.planner': go('/planner'),
    'nav.settings': go('/settings'),
    'file.save': { run: () => void session.save(), enabled: hasDoc },
    'file.saveAs': { run: () => void session.save({ saveAs: true }), enabled: hasDoc },
    'file.open': {
      run: () => {
        guard(session.open);
      },
    },
    'file.new': {
      run: () => {
        guard(() => session.newDocument('empty'));
      },
    },
    'file.close': {
      run: () => {
        guard(session.close);
      },
      enabled: () => sessionStore.getState().status === 'ready',
    },
    'edit.undo': {
      run: () => {
        docStore.getState().undo();
      },
      enabled: () => docStore.getState().undoLabel !== null,
    },
    'edit.redo': {
      run: () => {
        docStore.getState().redo();
      },
      enabled: () => docStore.getState().redoLabel !== null,
    },
  });

  return discardModal;
}
