import type { UsTaxYear } from './types';

/** US tax year 2026, as published by the IRS (Rev. Proc. 2025-32) and the SSA. */
export const US_2026: UsTaxYear = {
  year: 2026,
  federal: {
    single: {
      standardDeduction: 16_100,
      brackets: [
        [12_400, 0.1],
        [50_400, 0.12],
        [105_700, 0.22],
        [201_775, 0.24],
        [256_225, 0.32],
        [640_600, 0.35],
        [null, 0.37],
      ],
    },
    mfj: {
      standardDeduction: 32_200,
      brackets: [
        [24_800, 0.1],
        [100_800, 0.12],
        [211_400, 0.22],
        [403_550, 0.24],
        [512_450, 0.32],
        [768_700, 0.35],
        [null, 0.37],
      ],
    },
  },
  socialSecurity: { rate: 0.062, wageBase: 184_500 },
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
