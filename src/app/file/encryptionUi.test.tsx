import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyDocument } from '@/domain/schema/defaults';
import type { EncryptionInfo } from '@/persistence/codec/crypto';
import { docStore } from '@/store/docStore';
import { sessionStore } from '@/store/sessionStore';
import { App } from '../App';

const encryption = { key: {}, salt: new Uint8Array(16), iterations: 1 } as EncryptionInfo;

beforeEach(() => {
  window.location.hash = '';
  docStore.getState().load(createEmptyDocument({ appVersion: 'test' }));
  sessionStore.setState({ status: 'ready' });
});
afterEach(() => {
  docStore.getState().unload();
  sessionStore.setState({ encryption: null, unencryptedCopy: null });
});

describe('encryption in the file menu', () => {
  it('shows a locked file icon while the file is encrypted', () => {
    sessionStore.setState({ encryption: null });
    const { unmount } = render(<App />);
    const plain = screen.getByRole('button', { name: 'File: Untitled' });
    expect(plain.querySelector('.tabler-icon-file-lock')).toBeNull();
    unmount();

    sessionStore.setState({ encryption });
    render(<App />);
    const locked = screen.getByRole('button', { name: 'File: Untitled (encrypted)' });
    expect(locked.querySelector('.tabler-icon-file-lock')).not.toBeNull();
  });
});

describe('unencrypted copy dialog', () => {
  it('keeps the encrypted version unless the user chooses otherwise', async () => {
    const resolve = vi.fn();
    sessionStore.setState({
      encryption,
      unencryptedCopy: { fileName: 'budget.transact.json', action: 'load', resolve },
    });
    render(<App />);
    expect(await screen.findByText('This copy isn’t encrypted')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Keep encrypted version' }));
    expect(resolve).toHaveBeenCalledWith(false);
  });

  it('offers to merge anyway for a merge', async () => {
    const resolve = vi.fn();
    sessionStore.setState({
      encryption,
      unencryptedCopy: { fileName: 'budget.transact.json', action: 'merge', resolve },
    });
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Merge anyway' }));
    expect(resolve).toHaveBeenCalledWith(true);
  });
});
