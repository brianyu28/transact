/**
 * Types for the current schema version, inferred from the zod schemas.
 * Import entity types from here rather than from a versioned schema module.
 */
import type { z } from 'zod';
import type * as S from './current';

export type { Id } from '@/lib/id';
export type { Cents } from '@/lib/money';
export type { ISODate } from '@/lib/date';

export type Timestamp = string;
export type TransactFile = z.infer<typeof S.TransactFileSchema>;
export type FileMeta = z.infer<typeof S.FileMetaSchema>;
export type FileSettings = z.infer<typeof S.FileSettingsSchema>;
export type Account = z.infer<typeof S.AccountSchema>;
export type AccountType = z.infer<typeof S.AccountTypeSchema>;
export type Category = z.infer<typeof S.CategorySchema>;
export type CategoryKind = z.infer<typeof S.CategoryKindSchema>;
export type Tag = z.infer<typeof S.TagSchema>;
export type Transaction = z.infer<typeof S.TransactionSchema>;
export type Split = z.infer<typeof S.SplitSchema>;
export type BalanceSnapshot = z.infer<typeof S.BalanceSnapshotSchema>;
export type Statement = z.infer<typeof S.StatementSchema>;
export type BudgetTarget = z.infer<typeof S.BudgetTargetSchema>;
export type BudgetTier = z.infer<typeof S.BudgetTierSchema>;
export type RolloverPolicy = z.infer<typeof S.RolloverPolicySchema>;
export type TemplateLine = z.infer<typeof S.TemplateLineSchema>;
export type BudgetPeriod = z.infer<typeof S.BudgetPeriodSchema>;
export type CustomBudget = z.infer<typeof S.CustomBudgetSchema>;
export type PlannerScenario = z.infer<typeof S.PlannerScenarioSchema>;
export type TaxRule = z.infer<typeof S.TaxRuleSchema>;
export type TemplateRuleKey = z.infer<typeof S.TemplateRuleKeySchema>;
export type Tombstone = TransactFile['tombstones'][number];

export const LIABILITY_ACCOUNT_TYPES: ReadonlySet<AccountType> = new Set(['credit', 'loan']);
