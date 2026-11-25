/** Filing statuses the US template supports. */
export type FilingStatus = 'single' | 'mfj';

/** Bracket upper bounds in dollars (`null` = no upper bound) and their marginal rates. */
export type Brackets = readonly (readonly [upTo: number | null, rate: number])[];

/**
 * Every published US figure the tax template uses for one tax year, in dollars and
 * fractions. Adding a tax year means adding one of these (see `index.ts`).
 */
export interface UsTaxYear {
  year: number;
  federal: Record<FilingStatus, { standardDeduction: number; brackets: Brackets }>;
  socialSecurity: { rate: number; wageBase: number };
  medicare: {
    rate: number;
    additionalRate: number;
    additionalThreshold: Record<FilingStatus, number>;
  };
  selfEmployment: {
    /** Share of net self-employment earnings subject to SE tax (92.35%). */
    earningsFactor: number;
    socialSecurityRate: number;
    medicareRate: number;
    /** Share of SE tax deductible from income for income tax. */
    deductibleShare: number;
  };
}
