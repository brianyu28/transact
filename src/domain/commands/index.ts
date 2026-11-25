/** Registry of all document commands. Add new commands here to make them dispatchable. */
import {
  createCustomBudget,
  createPeriod,
  createTemplateLine,
  deleteCustomBudget,
  deletePeriod,
  deleteTemplateLine,
  removePeriodLine,
  addPeriodLine,
  reorderTemplateLines,
  reorderCustomBudgets,
  setCustomBudgetArchived,
  setPeriodLine,
  updateCustomBudget,
  updateTemplateLine,
} from './budgets';
import { createAccount, deleteAccount, reorderAccounts, updateAccount } from './accounts';
import {
  createCategory,
  deleteCategory,
  reorderCategories,
  setCategoryParent,
  updateCategory,
} from './categories';
import {
  addTemplateRules,
  createScenario,
  deleteScenario,
  duplicateScenario,
  updateScenario,
  updateScenarioTaxYear,
} from './planner';
import { updateSettings } from './settings';
import { createSnapshot, deleteSnapshot, updateSnapshot } from './snapshots';
import {
  addReconcileAdjustment,
  createStatement,
  deleteStatement,
  finishStatement,
  reopenStatement,
  setStatementMembership,
  updateStatement,
} from './statements';
import { createTag, deleteTag, updateTag } from './tags';
import {
  copyTransactions,
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
  copyTransactions,
  saveTransaction,
  updateTransaction,
  updateTransactions,
  setTransferAccount,
  setSplits,
  deleteTransactions,
  createSnapshot,
  updateSnapshot,
  deleteSnapshot,
  createTemplateLine,
  updateTemplateLine,
  reorderTemplateLines,
  deleteTemplateLine,
  createPeriod,
  setPeriodLine,
  removePeriodLine,
  addPeriodLine,
  deletePeriod,
  createCustomBudget,
  updateCustomBudget,
  reorderCustomBudgets,
  setCustomBudgetArchived,
  deleteCustomBudget,
  createStatement,
  updateStatement,
  setStatementMembership,
  finishStatement,
  reopenStatement,
  deleteStatement,
  addReconcileAdjustment,
  createScenario,
  updateScenario,
  updateScenarioTaxYear,
  addTemplateRules,
  duplicateScenario,
  deleteScenario,
  updateSettings,
};

export type Commands = typeof commands;
export type CommandName = keyof Commands;
export type CommandPayload<K extends CommandName> = Parameters<Commands[K]['run']>[1];
export type CommandResult<K extends CommandName> = ReturnType<Commands[K]['run']>;

export { CommandError, type CommandContext } from './define';
export type { CustomBudgetInput, PeriodLineInput } from './budgets';
export type { StatementInput } from './statements';
export type { ScenarioChanges } from './planner';
export type {
  BulkChanges,
  NewTransaction,
  SplitInput,
  TransactionChanges,
  TransactionForm,
} from './transactions';
