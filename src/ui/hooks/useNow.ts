/**
 * useNow — a shared wall-clock tick (§16.1): re-renders with a fresh Date
 * every `intervalMs`. Container plumbing only — presentational components
 * never call it, and derived values built from it stay useMemo
 * (no useEffect+setState derivations).
 */

import { useEffect, useState } from 'react';

export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

export default useNow;
