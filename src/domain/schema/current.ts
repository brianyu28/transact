/**
 * The current schema of the Transact data file (version CURRENT_SCHEMA_VERSION), defined
 * as zod schemas. Older versions exist only as fixtures plus the migrations that upgrade
 * them (see migrations/). The TypeScript types
 * are inferred from these, so validation and types can never drift apart.
 *
 * Conventions:
 * - Optional fields are omitted when they hold their default (false / empty), which keeps
 *   files small; code must treat `undefined` as the default.
 * - Every entity has an `id` and an `updatedAt` timestamp; deletions leave a tombstone.
 *   Together these allow entity-level merging between devices (see `domain/sync/merge.ts`).
 * - Amounts are integer cents, signed from the account's perspective (+ = into the account).
 */
import { z } from 'zod';
import { isCents } from '@/lib/money';
import { isISODate } from '@/lib/date';
import { CURRENT_SCHEMA_VERSION } from './version';

// ── Primitives ───────────────────────────────────────────────────────────────

export const IdSchema = z.string().regex(/^[a-z]{3}_[0-9A-Za-z]{4,32}$/, 'Invalid id');
export const CentsSchema = z
  .number()
  .refine((v) => isCents(v), 'Must be an integer number of cents');
export const ISODateSchema = z.string().refine((v) => isISODate(v), 'Must be a YYYY-MM-DD date');
export const TimestampSchema = z.iso.datetime({ offset: true });
const NameSchema = z.string().trim().min(1).max(200);
const NoteSchema = z.string().max(10_000);

// ── File settings (shared by every device that opens the file) ──────────────

export const BudgetTierSchema = z.enum(['monthly', 'annual']);
export const RolloverPolicySchema = z.enum(['prompt', 'full', 'none']);

export const FileSettingsSchema = z.object({
  currency: z.string().length(3),
  locale: z.string().min(2),
  /** 0 = Sunday, 1 = Monday. */
  weekStartsOn: z.union([z.literal(0), z.literal(1)]),
  /** Month (1-12) in which the "annual" budget year starts. */
  budgetYearStartMonth: z.number().int().min(1).max(12),
  budget: z.object({
    /** Order used to break ties between equally specific monthly/annual lines. */
    tierOrder: z.tuple([BudgetTierSchema, BudgetTierSchema]),
    /** Which "Everything Else" line wins when both monthly and annual have one. */
    everythingElseTier: BudgetTierSchema,
    /** Whether uncategorized expenses count toward "Everything Else". */
    uncategorizedToEverythingElse: z.boolean(),
    defaultRolloverPolicy: RolloverPolicySchema,
  }),
  /** Days before/after a statement period in which transactions are offered for reconciling. */
  reconcileGraceDays: z.number().int().min(0).max(60),
});

// ── Accounts, categories, tags ───────────────────────────────────────────────

export const AccountTypeSchema = z.enum([
  'checking',
  'savings',
  'credit',
  'brokerage',
  'retirement',
  'cash',
  'loan',
  'property',
  'other',
]);

export const AccountSchema = z.object({
  id: IdSchema,
  name: NameSchema,
  type: AccountTypeSchema,
  institution: z.string().max(200).optional(),
  note: NoteSchema.optional(),
  closed: z.literal(true).optional(),
  order: z.number(),
  updatedAt: TimestampSchema,
});

export const CategoryKindSchema = z.enum(['income', 'expense']);

export const CategorySchema = z.object({
  id: IdSchema,
  name: NameSchema,
  parentId: IdSchema.nullable(),
  /** Only meaningful on top-level categories; children inherit it. Defaults to expense. */
  kind: CategoryKindSchema.optional(),
  order: z.number(),
  archived: z.literal(true).optional(),
  updatedAt: TimestampSchema,
});

export const TagSchema = z.object({
  id: IdSchema,
  name: NameSchema,
  color: z.string().max(32).optional(),
  archived: z.literal(true).optional(),
  updatedAt: TimestampSchema,
});

// ── Transactions ─────────────────────────────────────────────────────────────

export const SplitSchema = z.object({
  id: IdSchema,
  amount: CentsSchema,
  categoryId: IdSchema.optional(),
  tags: z.array(IdSchema).min(1).optional(),
  excluded: z.literal(true).optional(),
  note: NoteSchema.optional(),
});

export const TransactionSchema = z
  .object({
    id: IdSchema,
    accountId: IdSchema,
    date: ISODateSchema,
    payee: z.string().max(500),
    amount: CentsSchema,
    /** The normal (unsplit) case. Must be absent when `splits` is present. */
    categoryId: IdSchema.optional(),
    excluded: z.literal(true).optional(),
    tags: z.array(IdSchema).min(1).optional(),
    /** Only for split transactions: ≥2 entries whose amounts sum to `amount`. */
    splits: z.array(SplitSchema).min(2).optional(),
    note: NoteSchema.optional(),
    reconciled: z.literal(true).optional(),
    statementId: IdSchema.optional(),
    /** Linked counterpart in another account (transfers are two linked transactions). */
    transfer: z.object({ peerId: IdSchema }).optional(),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
  })
  .superRefine((t, ctx) => {
    if (!t.splits) return;
    if (t.categoryId !== undefined) {
      ctx.addIssue({
        code: 'custom',
        message: 'Split transactions cannot have a top-level category',
        path: ['categoryId'],
      });
    }
    const sum = t.splits.reduce((s, x) => s + x.amount, 0);
    if (sum !== t.amount) {
      ctx.addIssue({
        code: 'custom',
        message: `Splits sum to ${sum}, expected ${t.amount}`,
        path: ['splits'],
      });
    }
  });

// ── Balances and statements ──────────────────────────────────────────────────

export const BalanceSnapshotSchema = z.object({
  id: IdSchema,
  accountId: IdSchema,
  /** The balance applies at the start of this date (before that day's transactions). */
  date: ISODateSchema,
  balance: CentsSchema,
  source: z.enum(['manual', 'statement']),
  note: NoteSchema.optional(),
  updatedAt: TimestampSchema,
});

export const StatementSchema = z.object({
  id: IdSchema,
  accountId: IdSchema,
  startDate: ISODateSchema,
  endDate: ISODateSchema,
  openingBalance: CentsSchema,
  closingBalance: CentsSchema,
  status: z.enum(['open', 'reconciled']),
  reconciledAt: TimestampSchema.optional(),
  note: NoteSchema.optional(),
  updatedAt: TimestampSchema,
});

// ── Budgets ──────────────────────────────────────────────────────────────────

export const BudgetTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('categories'), categoryIds: z.array(IdSchema).min(1) }),
  z.object({ kind: z.literal('everythingElse') }),
]);

export const TemplateLineSchema = z.object({
  id: IdSchema,
  name: z.string().max(200).optional(),
  cadence: BudgetTierSchema,
  target: BudgetTargetSchema,
  defaultAmount: CentsSchema,
  rolloverPolicy: RolloverPolicySchema,
  order: z.number(),
});

export const BudgetPeriodSchema = z.object({
  id: IdSchema,
  cadence: BudgetTierSchema,
  /** `YYYY-MM` for monthly periods, `YYYY` for annual periods. */
  period: z.string().regex(/^\d{4}(-\d{2})?$/),
  lines: z.array(
    z.object({
      templateLineId: IdSchema,
      name: z.string().max(200).optional(),
      target: BudgetTargetSchema,
      base: CentsSchema,
      rollover: CentsSchema,
      note: NoteSchema.optional(),
    }),
  ),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});

export const MatchRuleSchema = z.object({
  tags: z.array(IdSchema).min(1),
  mode: z.enum(['any', 'all']),
});

export const CustomBudgetSchema = z.object({
  id: IdSchema,
  name: NameSchema,
  match: MatchRuleSchema,
  dateRange: z
    .object({ start: ISODateSchema.optional(), end: ISODateSchema.optional() })
    .optional(),
  lines: z.array(
    z.object({
      id: IdSchema,
      name: z.string().max(200),
      target: BudgetTargetSchema,
      amount: CentsSchema,
    }),
  ),
  priority: z.number(),
  archived: z.literal(true).optional(),
  updatedAt: TimestampSchema,
});

// ── Planner ──────────────────────────────────────────────────────────────────

export const TaxBaseSchema = z.enum(['gross', 'wages', 'seEarnings', 'taxableIncome']);

export const TaxRuleSchema = z.object({
  id: IdSchema,
  name: NameSchema,
  base: TaxBaseSchema,
  baseFactor: z.number().positive().optional(),
  deduction: CentsSchema.optional(),
  schedule: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('flat'), rate: z.number().min(0).max(1) }),
    z.object({
      kind: z.literal('brackets'),
      brackets: z
        .array(z.object({ upTo: CentsSchema.nullable(), rate: z.number().min(0).max(1) }))
        .min(1),
    }),
  ]),
  /** Maximum taxable base, e.g. the Social Security wage base. */
  cap: CentsSchema.optional(),
  /** The cap is reduced by this base (since v2): SE Social Security's cap shrinks by W-2 wages. */
  capReducedBy: TaxBaseSchema.optional(),
  /** Only the base above this amount is taxed, e.g. Additional Medicare. */
  threshold: CentsSchema.optional(),
  /**
   * Computed separately for each person in the scenario, then added up (since v2), e.g.
   * Social Security, whose wage-base cap applies to each earner.
   */
  perPerson: z.literal(true).optional(),
  /**
   * Fractions of other taxes subtracted from this rule's base (since v2), e.g. half of
   * self-employment tax is deductible from income for income tax.
   */
  lessTaxes: z.array(z.object({ taxId: IdSchema, fraction: z.number().min(0).max(1) })).optional(),
});

export const PlannerScenarioSchema = z.object({
  id: IdSchema,
  name: NameSchema,
  year: z.number().int(),
  /** Earners in the household (since v2); incomes and deductions can belong to one. */
  people: z.array(z.object({ id: IdSchema, name: NameSchema })).optional(),
  incomes: z.array(
    z.object({
      id: IdSchema,
      name: NameSchema,
      kind: z.enum(['w2', '1099', 'other']),
      annual: CentsSchema,
      person: IdSchema.optional(),
    }),
  ),
  deductions: z.array(
    z.object({
      id: IdSchema,
      name: NameSchema,
      annual: CentsSchema,
      pretax: z.boolean(),
      reduces: z.array(TaxBaseSchema),
      person: IdSchema.optional(),
    }),
  ),
  taxes: z.array(TaxRuleSchema),
  updatedAt: TimestampSchema,
});

// ── File ─────────────────────────────────────────────────────────────────────

export const FileMetaSchema = z.object({
  fileId: IdSchema,
  /** Incremented on every save; used to detect concurrent edits from other devices. */
  revision: z.number().int().min(0),
  createdAt: TimestampSchema,
  savedAt: TimestampSchema.nullable(),
  savedBy: IdSchema.nullable(),
  appVersion: z.string(),
});

export const TransactFileSchema = z.object({
  format: z.literal('transact'),
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  meta: FileMetaSchema,
  settings: FileSettingsSchema,
  accounts: z.array(AccountSchema),
  categories: z.array(CategorySchema),
  tags: z.array(TagSchema),
  transactions: z.array(TransactionSchema),
  balanceSnapshots: z.array(BalanceSnapshotSchema),
  statements: z.array(StatementSchema),
  budgets: z.object({
    template: z.object({ lines: z.array(TemplateLineSchema), updatedAt: TimestampSchema }),
    periods: z.array(BudgetPeriodSchema),
    custom: z.array(CustomBudgetSchema),
  }),
  planner: z.object({ scenarios: z.array(PlannerScenarioSchema) }),
  tombstones: z.array(z.object({ id: IdSchema, deletedAt: TimestampSchema })),
});
