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
