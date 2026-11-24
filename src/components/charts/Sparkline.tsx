import type { Cents } from '@/lib/money';
import styles from './Sparkline.module.scss';

interface SparklineProps {
  values: readonly Cents[];
  width?: number;
  height?: number;
  label: string;
}

/** Tiny trend line (SVG). Shape only: no axes; the end point is marked. */
export function Sparkline({ values, width = 80, height = 20, label }: SparklineProps) {
  if (values.length < 2) return <span className={styles.empty} style={{ width, height }} />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 3;
  const x = (i: number) => pad + (i / (values.length - 1)) * (width - pad * 2);
  const y = (v: number) => pad + (1 - (v - min) / span) * (height - pad * 2);
  const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const last = values.at(-1) ?? 0;
  return (
    <svg
      className={styles.root}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label}
    >
      <polyline points={points} className={styles.line} />
      <circle cx={x(values.length - 1)} cy={y(last)} r={2.5} className={styles.dot} />
    </svg>
  );
}
