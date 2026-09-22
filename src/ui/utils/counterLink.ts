/**
 * Counter deep-link builder — the one place that knows the /counter URL
 * contract: which zikr to count, the plan's own target (?target= — the
 * counter falls back to the zikr's library default when omitted), and the
 * owning personal plan (?planId=, which enables the counter's
 * "continue next zikr" sequence for per-zikr plans).
 */

export interface CounterLink {
  zikrId: number;
  /** Plan-provided target; omit to count toward the zikr's default. */
  target?: number;
  planId?: string;
}

export function counterUrl(link: CounterLink): string {
  const params = new URLSearchParams({ zikrId: String(link.zikrId) });
  if (link.target && link.target > 0) params.set('target', String(link.target));
  if (link.planId) params.set('planId', link.planId);
  return `/counter?${params.toString()}`;
}
