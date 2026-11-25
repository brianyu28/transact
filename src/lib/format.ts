/** Small display helpers. */

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/** "just now", "5 minutes ago", "yesterday", … */
export function formatRelativeTime(iso: string, now: number = Date.now()): string {
  const seconds = Math.round((Date.parse(iso) - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 45) return 'just now';
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), 'minute');
  if (abs < 86_400) return rtf.format(Math.round(seconds / 3600), 'hour');
  if (abs < 86_400 * 30) return rtf.format(Math.round(seconds / 86_400), 'day');
  return new Date(iso).toLocaleDateString();
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count.toLocaleString()} ${count === 1 ? singular : plural}`;
}

/** A byte count for display: "812 bytes", "4.2 KB", "1.3 MB" (1 KB = 1024 bytes). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return pluralize(bytes, 'byte');
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toLocaleString(undefined, { maximumFractionDigits: value < 10 ? 1 : 0 })} ${units[unit] ?? ''}`;
}

/** Data file extensions, longest first: `.transact.json`, `.transact` and plain `.json`. */
const FILE_EXTENSION_RE = /\.transact\.json$|\.transact$|\.json$/i;

/** The extension of a data file name ("" if it has none of the data file extensions). */
export function fileExtension(name: string): string {
  return FILE_EXTENSION_RE.exec(name)?.[0] ?? '';
}

/** A file name for display: "Budget.transact.json" → "Budget". The real name is unchanged. */
export function displayFileName(name: string): string {
  return name.replace(FILE_EXTENSION_RE, '') || name;
}
