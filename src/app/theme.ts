import { createTheme, type MantineColorsTuple } from '@mantine/core';

// Indigo accent (kept distinct from the green/red used for positive/negative amounts).
const accent: MantineColorsTuple = [
  '#eef0ff',
  '#dcdeff',
  '#b6baff',
  '#8f94ff',
  '#7076fb',
  '#5c62f5',
  '#4c51d9',
  '#3e43bd',
  '#33379b',
  '#272a78',
];

/**
 * Compact Mantine theme: small default control sizes and a tight spacing scale,
 * tuned for information density (spreadsheet-like rather than marketing-like).
 */
export const theme = createTheme({
  fontFamily: 'var(--tx-font)',
  fontFamilyMonospace: 'var(--tx-font-mono)',
  primaryColor: 'accent',
  colors: { accent },
  primaryShade: { light: 6, dark: 3 },
  defaultRadius: 'sm',
  cursorType: 'pointer',
  fontSizes: { xs: '11px', sm: '12px', md: '13px', lg: '15px', xl: '18px' },
  spacing: { xs: '4px', sm: '8px', md: '12px', lg: '16px', xl: '24px' },
  headings: {
    fontWeight: '600',
    sizes: {
      h1: { fontSize: '18px', lineHeight: '1.3' },
      h2: { fontSize: '15px', lineHeight: '1.3' },
      h3: { fontSize: '13px', lineHeight: '1.3' },
    },
  },
  components: {
    Button: { defaultProps: { size: 'xs' } },
    ActionIcon: { defaultProps: { size: 'sm', variant: 'subtle' } },
    TextInput: { defaultProps: { size: 'xs' } },
    NumberInput: { defaultProps: { size: 'xs' } },
    Select: { defaultProps: { size: 'xs' } },
    Checkbox: { defaultProps: { size: 'xs' } },
    Tooltip: { defaultProps: { openDelay: 400, fz: 'xs' } },
  },
});
