import { TextInput, type TextInputProps } from '@mantine/core';
import { clsx } from 'clsx';
import { useState } from 'react';
import { useFormat } from '@/hooks/useFormat';
import { centsToInput, parseMoney, type Cents } from '@/lib/money';
import styles from './MoneyInput.module.scss';

interface MoneyInputProps extends Omit<TextInputProps, 'value' | 'onChange' | 'defaultValue'> {
  value: Cents;
  /** Called with the parsed amount when the field is committed (blur or Enter). */
  onCommit: (cents: Cents) => void;
}

/** Money field that edits as text and commits integer cents on blur/Enter (invalid input reverts). */
export function MoneyInput({ value, onCommit, className, ...props }: MoneyInputProps) {
  const format = useFormat();
  const [text, setText] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  // Formatted ("$3,200.00") until focused; plain ("3200.00") while editing.
  const shown = text ?? (focused ? centsToInput(value) : format.money(value));
  const commit = () => {
    if (text === null) return;
    const cents = parseMoney(text);
    setText(null);
    if (cents !== null && cents !== value) onCommit(cents);
  };
  return (
    <TextInput
      {...props}
      className={clsx(className)}
      classNames={{ input: styles.input }}
      inputMode="decimal"
      value={shown}
      onChange={(e) => {
        setText(e.currentTarget.value);
      }}
      onFocus={(e) => {
        setFocused(true);
        const input = e.currentTarget;
        requestAnimationFrame(() => {
          input.select();
        });
      }}
      onBlur={() => {
        setFocused(false);
        commit();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') setText(null);
      }}
    />
  );
}
