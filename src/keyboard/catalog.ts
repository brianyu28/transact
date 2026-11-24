/**
 * Every keyboard-invocable command, with its default bindings. Screens attach handlers
 * by id (see `useCommandHandlers`); the palette, help overlay and Settings → Keyboard all
 * read this catalog, so a command only needs to be declared here once.
 */
export interface CommandInfo {
  id: string;
  title: string;
  group: CommandGroup;
  /** Default bindings (see keys.ts for syntax). */
  keys: readonly string[];
  /** Also fires while typing in a text field. */
  allowInInputs?: boolean;
}

export type CommandGroup = 'General' | 'Navigation' | 'File' | 'Edit' | 'Transactions' | 'Budgets';

export const COMMAND_GROUPS: readonly CommandGroup[] = [
  'General',
  'Navigation',
  'File',
  'Edit',
  'Transactions',
];

export const COMMANDS = [
  // General
  {
    id: 'app.palette',
    title: 'Command palette',
    group: 'General',
    keys: ['mod+k'],
    allowInInputs: true,
  },
  { id: 'app.help', title: 'Keyboard shortcuts', group: 'General', keys: ['?'] },
  { id: 'app.toggleSidebar', title: 'Toggle sidebar', group: 'General', keys: ['mod+\\'] },
  // Navigation
  { id: 'nav.home', title: 'Go to Home', group: 'Navigation', keys: ['g h'] },
  { id: 'nav.transactions', title: 'Go to Transactions', group: 'Navigation', keys: ['g t'] },
  { id: 'nav.budgets', title: 'Go to Budgets', group: 'Navigation', keys: ['g b'] },
  { id: 'nav.accounts', title: 'Go to Accounts', group: 'Navigation', keys: ['g a'] },
  { id: 'nav.statements', title: 'Go to Statements', group: 'Navigation', keys: ['g s'] },
  { id: 'nav.reports', title: 'Go to Reports', group: 'Navigation', keys: ['g r'] },
  { id: 'nav.planner', title: 'Go to Planner', group: 'Navigation', keys: ['g p'] },
  { id: 'nav.settings', title: 'Go to Settings', group: 'Navigation', keys: ['g ,'] },
  // File
  { id: 'file.save', title: 'Save', group: 'File', keys: ['mod+s'], allowInInputs: true },
  {
    id: 'file.saveAs',
    title: 'Save as…',
    group: 'File',
    keys: ['mod+shift+s'],
    allowInInputs: true,
  },
  { id: 'file.open', title: 'Open file…', group: 'File', keys: ['mod+o'] },
  { id: 'file.new', title: 'New file', group: 'File', keys: [] },
  { id: 'file.close', title: 'Close file', group: 'File', keys: [] },
  // Edit
  { id: 'edit.undo', title: 'Undo', group: 'Edit', keys: ['mod+z'] },
  { id: 'edit.redo', title: 'Redo', group: 'Edit', keys: ['mod+shift+z', 'mod+y'] },
  // Transactions
  { id: 'txn.new', title: 'New transaction', group: 'Transactions', keys: ['n'] },
  { id: 'txn.filter', title: 'Filter transactions', group: 'Transactions', keys: ['/'] },
  { id: 'txn.next', title: 'Next transaction', group: 'Transactions', keys: ['j', 'arrowdown'] },
  { id: 'txn.prev', title: 'Previous transaction', group: 'Transactions', keys: ['k', 'arrowup'] },
  { id: 'txn.select', title: 'Select / deselect', group: 'Transactions', keys: ['x'] },
  { id: 'txn.selectAll', title: 'Select all shown', group: 'Transactions', keys: ['shift+a'] },
  { id: 'txn.clear', title: 'Clear selection', group: 'Transactions', keys: ['escape'] },
  { id: 'txn.edit', title: 'Edit transaction', group: 'Transactions', keys: ['enter', 'e'] },
  { id: 'txn.category', title: 'Set category', group: 'Transactions', keys: ['c'] },
  { id: 'txn.tags', title: 'Add or remove tags', group: 'Transactions', keys: ['t'] },
  { id: 'txn.reconcile', title: 'Toggle reconciled', group: 'Transactions', keys: ['r'] },
  { id: 'txn.exclude', title: 'Toggle excluded from budgets', group: 'Transactions', keys: ['-'] },
  { id: 'txn.split', title: 'Split transaction', group: 'Transactions', keys: ['s'] },
  { id: 'txn.delete', title: 'Delete', group: 'Transactions', keys: ['delete', 'mod+backspace'] },
  // Budgets
  { id: 'budget.prev', title: 'Previous period', group: 'Budgets', keys: ['['] },
  { id: 'budget.next', title: 'Next period', group: 'Budgets', keys: [']'] },
  { id: 'budget.current', title: 'Current period', group: 'Budgets', keys: ['.'] },
] as const satisfies readonly CommandInfo[];

export type CommandId = (typeof COMMANDS)[number]['id'];

export const COMMANDS_BY_ID: ReadonlyMap<string, CommandInfo> = new Map(
  COMMANDS.map((c) => [c.id, c]),
);
