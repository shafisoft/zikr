/**
 * Hijri date — Noor 2.0 phase 5: the app's day line reads both calendars.
 * The Umm al-Qura Islamic calendar ships with every modern browser's Intl
 * (no library, offline, $0) — this is a thin, failure-soft wrapper: when a
 * runtime lacks the calendar, the caller hides the Hijri half and keeps
 * the Gregorian weekday.
 */

export function hijriDateLabel(date: Date, lang: string): string | null {
  try {
    return new Intl.DateTimeFormat(
      lang === 'bn' ? 'bn-u-ca-islamic-umalqura' : 'en-u-ca-islamic-umalqura',
      { day: 'numeric', month: 'long', year: 'numeric' }
    ).format(date);
  } catch {
    return null;
  }
}

/** "Sunday · 27 Jumada II 1448" — both calendars on one quiet line. */
export function dateLineLabel(now: Date, lang: string): string {
  const weekday = new Intl.DateTimeFormat(lang === 'bn' ? 'bn' : 'en', {
    weekday: 'long',
  }).format(now);
  const hijri = hijriDateLabel(now, lang);
  return hijri ? `${weekday} · ${hijri}` : weekday;
}
