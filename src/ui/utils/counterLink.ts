/**
 * Counter deep-link builder — the one place that knows the /counter URL
 * contract: which zikr to count, the plan's own target (?target= — the
 * counter falls back to the zikr's library default when omitted), the
 * owning personal plan (?planId=, which enables the counter's
 * "continue next zikr" sequence for per-zikr plans), the owning
 * routine (?routineId=, which runs the routine's guided item-by-item
 * flow — R2, §5.2), and the after-salah set (?postSalah=<prayer>, which
 * runs the guided 33→33→34→100 flow — R1, §4.6).
 */

export type PostSalahPrayerParam = 'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';

export interface CounterLink {
  /** Omitted only for the post-salah source (the flow derives its steps). */
  zikrId?: number;
  /** Plan-provided target; omit to count toward the zikr's default. */
  target?: number;
  planId?: string;
  /** Routine flow source (R2): the counter advances through the routine's items. */
  routineId?: string;
  /** Post-salah flow source (R1): the prayer whose set is being counted. */
  postSalah?: PostSalahPrayerParam;
}

export function counterUrl(link: CounterLink): string {
  const params = new URLSearchParams();
  if (link.zikrId != null) params.set('zikrId', String(link.zikrId));
  if (link.target && link.target > 0) params.set('target', String(link.target));
  if (link.planId) params.set('planId', link.planId);
  if (link.routineId) params.set('routineId', link.routineId);
  if (link.postSalah) params.set('postSalah', link.postSalah);
  return `/counter?${params.toString()}`;
}
