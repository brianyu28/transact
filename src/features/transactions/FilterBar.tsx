import { ActionIcon, CloseButton, Popover, TextInput, Tooltip } from '@mantine/core';
import { IconFilter, IconHelp } from '@tabler/icons-react';
import { clsx } from 'clsx';
import type { Ref } from 'react';
import type { CompiledFilter } from '@/domain/transactions/filter';
import { registerActions, useRegister } from './registerStore';
import styles from './FilterBar.module.scss';

const EXAMPLES: readonly [string, string][] = [
  ['acct:amex', 'Account name'],
  ['cat:food', 'Category, including subcategories'],
  ['tag:trip-2026', 'Tag'],
  ['payee:"corner grocer"', 'Payee contains'],
  ['is:unreconciled', 'Also reconciled, split, transfer, excluded, uncategorized, income, expense'],
  ['2026-11  2026-01..2026-03', 'Month, year, day, or a range'],
  ['date:last-month', 'Also this-month, this-year, last-year, last-30-days'],
  ['>50  <=100  =42.10', 'Amount (ignoring sign)'],
  ['-tag:reimbursable', 'Any term can be negated with -'],
  ['coffee', 'Payee or note contains'],
];

interface FilterBarProps {
  filter: CompiledFilter | null;
  inputRef: Ref<HTMLInputElement>;
}

/** Text filter with the parsed terms shown as chips (problem terms highlighted). */
export function FilterBar({ filter, inputRef }: FilterBarProps) {
  const query = useRegister((s) => s.query);
  const problems = new Set(filter?.problems.map((p) => p.term.raw));

  return (
    <div className={styles.root}>
      <TextInput
        ref={inputRef}
        className={styles.input}
        size="xs"
        placeholder="Filter: acct:checking cat:food 2026-11 >20 …"
        aria-label="Filter transactions"
        leftSection={<IconFilter size={14} />}
        value={query}
        onChange={(e) => {
          registerActions.setQuery(e.currentTarget.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            if (query) registerActions.setQuery('');
            else e.currentTarget.blur();
          }
          if (e.key === 'Enter' || e.key === 'ArrowDown') e.currentTarget.blur();
        }}
        rightSection={
          query ? (
            <CloseButton
              size="xs"
              aria-label="Clear filter"
              onClick={() => {
                registerActions.setQuery('');
              }}
            />
          ) : null
        }
      />
      <Popover position="bottom-start" width={420} shadow="md">
        <Popover.Target>
          <Tooltip label="Filter syntax">
            <ActionIcon color="gray" aria-label="Filter syntax">
              <IconHelp size={16} />
            </ActionIcon>
          </Tooltip>
        </Popover.Target>
        <Popover.Dropdown>
          <table className={styles.help}>
            <tbody>
              {EXAMPLES.map(([example, meaning]) => (
                <tr key={example}>
                  <td>
                    <code>{example}</code>
                  </td>
                  <td>{meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Popover.Dropdown>
      </Popover>
      {filter && filter.terms.length > 0 && (
        <div className={styles.chips}>
          {filter.terms.map((term, i) => (
            <span
              key={`${term.raw}-${i}`}
              className={clsx(styles.chip, problems.has(term.raw) && styles.problem)}
              title={filter.problems.find((p) => p.term === term)?.message}
            >
              {term.negated && <span className={styles.not}>not</span>}
              <span className={styles.kind}>{term.kind === 'text' ? 'text' : term.kind}</span>
              {term.value}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
