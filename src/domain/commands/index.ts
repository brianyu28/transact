/** Registry of all document commands. Add new commands here to make them dispatchable. */
import { createAccount, deleteAccount, reorderAccounts, updateAccount } from './accounts';
import {
  createCategory,
  deleteCategory,
  reorderCategories,
  setCategoryParent,
  updateCategory,
} from './categories';
import { updateSettings } from './settings';
import { createSnapshot, deleteSnapshot, updateSnapshot } from './snapshots';
import { createTag, deleteTag, updateTag } from './tags';
import {
  createTransaction,
  deleteTransactions,
  saveTransaction,
  setSplits,
  setTransferAccount,
  updateTransaction,
  updateTransactions,
} from './transactions';

export const commands = {
  createAccount,
  updateAccount,
  reorderAccounts,
  deleteAccount,
  createCategory,
  updateCategory,
  reorderCategories,
  setCategoryParent,
  deleteCategory,
  createTag,
  updateTag,
  deleteTag,
  createTransaction,
  saveTransaction,
  updateTransaction,
  updateTransactions,
  setTransferAccount,
  setSplits,
  deleteTransactions,
  createSnapshot,
  updateSnapshot,
  deleteSnapshot,
  updateSettings,
};

export type Commands = typeof commands;
export type CommandName = keyof Commands;
export type CommandPayload<K extends CommandName> = Parameters<Commands[K]['run']>[1];
export type CommandResult<K extends CommandName> = ReturnType<Commands[K]['run']>;

export { CommandError, type CommandContext } from './define';
export type {
  BulkChanges,
  NewTransaction,
  SplitInput,
  TransactionChanges,
  TransactionForm,
} from './transactions';
