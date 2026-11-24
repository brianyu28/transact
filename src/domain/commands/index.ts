/** Registry of all document commands. Add new commands here to make them dispatchable. */
import { createAccount, updateAccount } from './accounts';
import { createCategory } from './categories';
import { updateSettings } from './settings';
import { createTag } from './tags';
import { createTransaction, deleteTransactions, updateTransaction } from './transactions';

export const commands = {
  createAccount,
  updateAccount,
  createCategory,
  createTag,
  createTransaction,
  updateTransaction,
  deleteTransactions,
  updateSettings,
};

export type Commands = typeof commands;
export type CommandName = keyof Commands;
export type CommandPayload<K extends CommandName> = Parameters<Commands[K]['run']>[1];
export type CommandResult<K extends CommandName> = ReturnType<Commands[K]['run']>;

export { CommandError, type CommandContext } from './define';
