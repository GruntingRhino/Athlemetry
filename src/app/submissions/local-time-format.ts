/**
 * Timestamp wording for the submissions list. Server components render in the
 * server's timezone, so the viewer's local time is formatted in the browser;
 * the server (and first client) render uses a stable UTC date instead.
 */

/** Stable, timezone-independent text used for server render and invalid input. */
export function formatStableDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return `${date.toISOString().slice(0, 10)} UTC`;
}

/** Medium date plus short time in the viewer's locale and timezone (override both for tests). */
export function formatLocalDateTime(iso: string, locale?: string, timeZone?: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone }).format(date);
  } catch {
    return formatStableDate(iso);
  }
}
