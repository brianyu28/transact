import type { UsTaxYear } from './types';

/**
 * US tax year 2027, as published by the IRS (Rev. Proc. 2026-35) and the SSA. Medicare
 * rates, the Additional Medicare thresholds and self-employment factors are set in law
 * and unchanged from 2026.
 */
export const US_2027: UsTaxYear = {
  year: 2027,
  federal: {
    single: {
      standardDeduction: 16_600,
      brackets: [
        [12_800, 0.1],
        [52_025, 0.12],
        [109_125, 0.22],
        [208_325, 0.24],
        [264_550, 0.32],
        [661_375, 0.35],
        [null, 0.37],
      ],
    },
    mfj: {
      standardDeduction: 33_200,
      brackets: [
        [25_600, 0.1],
        [104_050, 0.12],
        [218_250, 0.22],
        [416_650, 0.24],
        [529_100, 0.32],
        [793_650, 0.35],
        [null, 0.37],
      ],
    },
  },
  socialSecurity: { rate: 0.062, wageBase: 192_300 },
  medicare: {
    rate: 0.0145,
    additionalRate: 0.009,
    additionalThreshold: { single: 200_000, mfj: 250_000 },
  },
  selfEmployment: {
    earningsFactor: 0.9235,
    socialSecurityRate: 0.124,
    medicareRate: 0.029,
    deductibleShare: 0.5,
  },
};
