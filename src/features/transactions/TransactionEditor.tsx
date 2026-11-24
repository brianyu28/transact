import { ActionIcon, Autocomplete, Button, Select, TextInput, Tooltip } from '@mantine/core';
import { IconArrowsSplit, IconCheck, IconX } from '@tabler/icons-react';
import { clsx } from 'clsx';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  categoryTree,
  payeeIndex,
  sortedAccounts,
  sortedTags,
  type PayeeInfo,
} from '@/domain/aggregates/lookups';
import { getTransaction } from '@/domain/model';
import type { Id, Transaction } from '@/domain/schema/types';
import { CategorySelect } from '@/components/CategorySelect/CategorySelect';
import {
  categoryValue,
  parseCategoryValue,
  transferValue,
  type CategoryValue,
} from '@/components/CategorySelect/categoryValue';
import { isISODate, today } from '@/lib/date';
import { centsToInput } from '@/lib/money';
import { tryDispatch } from '@/store/actions';
import { docStore, useDocStore } from '@/store/docStore';
import { resolveAmount } from './amount';
import { registerStore } from './registerStore';
import { TagsField } from './TagsField';
import styles from './TransactionEditor.module.scss';

interface FormState {
  date: string;
  accountId: Id | null;
  payee: string;
  category: CategoryValue;
  tags: string[];
  amount: string;
  note: string;
}

function initialState(t: Transaction | undefined, defaultAccountId: Id | null): FormState {
  const doc = docStore.getState().doc;
  if (!t || !doc) {
    return {
      date: today(),
      accountId: defaultAccountId,
      payee: '',
      category: '',
      tags: [],
      amount: '',
      note: '',
    };
  }
  const peer = t.transfer ? getTransaction(doc, t.transfer.peerId) : undefined;
  return {
    date: t.date,
    accountId: t.accountId,
    payee: t.payee,
    category: peer ? transferValue(peer.accountId) : categoryValue(t.categoryId),
    tags: (t.tags ?? []).map((id) => doc.tags[id]?.name ?? '').filter(Boolean),
    amount: t.amount > 0 ? `+${centsToInput(t.amount)}` : centsToInput(t.amount),
    note: t.note ?? '',
  };
}

interface TransactionEditorProps {
  /** Transaction to edit, or undefined for a new one. */
  transaction?: Transaction | undefined;
  /** 'row' for the desktop grid, 'stack' for the phone sheet. */
  layout: 'row' | 'stack';
  defaultAccountId: Id | null;
  onDone: () => void;
}

/** True if a dropdown, popover or dialog is visible (Mantine keeps closed ones mounted but hidden). */
function isOverlayOpen(): boolean {
  return [...document.querySelectorAll('.mantine-Popover-dropdown, [role="dialog"]')].some(
    (el) => el.getClientRects().length > 0,
  );
}

export function TransactionEditor({
  transaction,
  layout,
  defaultAccountId,
  onDone,
}: TransactionEditorProps) {
  const accounts = useDocStore((s) => s.doc?.accounts);
  const categories = useDocStore((s) => s.doc?.categories);
  const tagsMap = useDocStore((s) => s.doc?.tags);
  const transactions = useDocStore((s) => s.doc?.transactions);
  const [form, setForm] = useState<FormState>(() => initialState(transaction, defaultAccountId));
  const [error, setError] = useState<string | null>(null);
  const payeeRef = useRef<HTMLInputElement>(null);
  const isNew = transaction === undefined;
  const isSplit = transaction?.splits !== undefined;
  const compact = layout === 'row';

  // Escape closes the editor wherever focus is. If a dropdown or popover is open, that
  // Escape closes it instead (Mantine handles it first; it's still in the DOM here).
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });
  useEffect(() => {
    if (!compact) return; // the phone sheet's modal handles Escape
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (isOverlayOpen()) return;
      e.preventDefault();
      onDoneRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, [compact]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setError(null);
  };

  const accountOptions = useMemo(
    () =>
      accounts
        ? sortedAccounts({ accounts })
            .filter((a) => !a.closed || a.id === form.accountId)
            .map((a) => ({ value: a.id, label: a.name }))
        : [],
    [accounts, form.accountId],
  );
  const payees = useMemo(
    () => (transactions ? payeeIndex(transactions) : new Map<string, PayeeInfo>()),
    [transactions],
  );
  // Suggestions appear only once you start typing, so focusing the field stays quiet.
  const payeeOptions = useMemo(() => {
    const q = form.payee.trim().toLowerCase();
    if (!q) return [];
    const out: string[] = [];
    for (const info of payees.values()) {
      const name = info.name.toLowerCase();
      if (name.includes(q) && name !== q) out.push(info.name);
      if (out.length >= 8) break;
    }
    return out;
  }, [payees, form.payee]);
  const tagOptions = useMemo(
    () =>
      tagsMap
        ? sortedTags({ tags: tagsMap })
            .filter((t) => !t.archived)
            .map((t) => t.name)
        : [],
    [tagsMap],
  );

  /** New transactions: picking a known payee fills in its usual category. */
  const onPayeeChosen = (payee: string) => {
    set('payee', payee);
    if (!isNew || form.category) return;
    const info = payees.get(payee.toLowerCase());
    if (info?.lastCategoryId && categories?.[info.lastCategoryId]) {
      set('category', categoryValue(info.lastCategoryId));
    }
  };

  const save = () => {
    if (!form.accountId) {
      setError('Choose an account.');
      return;
    }
    if (!isISODate(form.date)) {
      setError('Enter a valid date.');
      return;
    }
    const { categoryId, transferAccountId } = parseCategoryValue(form.category);
    const income =
      categoryId !== null && categories
        ? categoryTree(categories).byId.get(categoryId)?.kind === 'income'
        : false;
    const amount = resolveAmount(form.amount, { previous: transaction?.amount, income });
    if (amount === null) {
      setError('Enter an amount.');
      return;
    }
    const id = tryDispatch('saveTransaction', {
      ...(transaction ? { id: transaction.id } : {}),
      accountId: form.accountId,
      date: form.date,
      payee: form.payee,
      amount,
      categoryId,
      transferAccountId,
      tagNames: form.tags,
      note: form.note,
    });
    if (id === undefined) return;
    registerStore.setState({ activeId: id });
    onDone();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
    // Open dropdowns and buttons handle Enter themselves.
    if (target.getAttribute('aria-expanded') === 'true' || target.tagName === 'BUTTON') return;
    e.preventDefault();
    save();
  };

  const openSplit = () => {
    if (transaction) {
      registerStore.setState({ dialog: { kind: 'split', id: transaction.id }, editing: null });
    }
  };

  const input = compact
    ? { size: 'xs' as const, classNames: { input: clsx(styles.input) } }
    : { size: 'xs' as const };
  /** Labels only in the stacked layout; the row relies on the grid header. */
  const label = (text: string) => (compact ? {} : { label: text });

  const fields = (
    <>
      <TextInput
        {...input}
        type="date"
        aria-label="Date"
        {...label('Date')}
        value={form.date}
        onChange={(e) => {
          set('date', e.currentTarget.value);
        }}
        autoFocus={!isNew && compact}
      />
      <TextInput
        {...input}
        aria-label="Amount"
        {...label('Amount')}
        placeholder="-0.00"
        inputMode="decimal"
        value={form.amount}
        disabled={isSplit}
        onChange={(e) => {
          set('amount', e.currentTarget.value);
        }}
        classNames={{ input: clsx(compact && styles.input, styles.amountInput) }}
      />
      <Autocomplete
        {...input}
        ref={payeeRef}
        aria-label="Payee"
        {...label('Payee')}
        placeholder="Payee"
        data={payeeOptions}
        value={form.payee}
        onChange={(v) => {
          set('payee', v);
        }}
        onOptionSubmit={onPayeeChosen}
        onBlur={() => {
          onPayeeChosen(form.payee);
        }}
        autoFocus={isNew && compact}
        filter={({ options }) => options}
      />
      <Select
        {...input}
        aria-label="Account"
        {...label('Account')}
        data={accountOptions}
        value={form.accountId}
        allowDeselect={false}
        searchable
        selectFirstOptionOnChange
        onChange={(v) => {
          set('accountId', v);
        }}
        comboboxProps={{ width: 220, position: 'bottom-start' }}
      />
      {isSplit ? (
        <Button
          size="compact-xs"
          variant="light"
          leftSection={<IconArrowsSplit size={12} />}
          onClick={openSplit}
        >
          Split ({transaction.splits?.length})
        </Button>
      ) : (
        <CategorySelect
          {...input}
          aria-label="Category"
          {...label('Category')}
          value={form.category}
          onChange={(v) => {
            set('category', v);
          }}
          transfersFrom={form.accountId}
        />
      )}
      <TagsField
        value={form.tags}
        options={tagOptions}
        onChange={(v) => {
          set('tags', v);
        }}
        {...label('Tags')}
        compact={compact}
      />
    </>
  );

  const note = (
    <TextInput
      {...input}
      aria-label="Note"
      {...label('Note')}
      placeholder="Add a note"
      value={form.note}
      onChange={(e) => {
        set('note', e.currentTarget.value);
      }}
      className={clsx(styles.note)}
    />
  );

  const splitButton = !isNew && !transaction.transfer && !isSplit && (
    <Button
      size="compact-xs"
      variant="subtle"
      color="gray"
      leftSection={<IconArrowsSplit size={12} />}
      onClick={openSplit}
    >
      Split…
    </Button>
  );

  if (!compact) {
    return (
      <div
        className={styles.stack}
        onKeyDown={onKeyDown}
        role="group"
        aria-label={isNew ? 'New transaction' : 'Edit transaction'}
      >
        {fields}
        {note}
        {splitButton}
        {error && <span className={styles.error}>{error}</span>}
        <div className={styles.stackActions}>
          <Button variant="default" onClick={onDone}>
            Cancel
          </Button>
          <Button onClick={save}>Save</Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={styles.row}
      onKeyDown={onKeyDown}
      role="group"
      aria-label={isNew ? 'New transaction' : 'Edit transaction'}
    >
      <span className={styles.marker} aria-hidden />
      {fields}
      <span className={styles.rowActions}>
        <Tooltip label="Save (Enter)">
          <ActionIcon variant="filled" size={22} onClick={save} aria-label="Save">
            <IconCheck size={14} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Cancel (Esc)">
          <ActionIcon size={22} color="gray" onClick={onDone} aria-label="Cancel">
            <IconX size={14} />
          </ActionIcon>
        </Tooltip>
      </span>
      <span className={styles.secondLine}>
        {note}
        {splitButton}
        {error ? (
          <span className={styles.error}>{error}</span>
        ) : (
          <span className={styles.hint}>Enter to save · Esc to cancel</span>
        )}
      </span>
    </div>
  );
}
