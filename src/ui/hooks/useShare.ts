/**
 * useShare — native share intent with a graceful fallback.
 *
 * Uses the Web Share API when available (all modern mobile browsers,
 * installed PWAs), and falls back to copying the message to the clipboard
 * everywhere else. Returns what happened so the caller can show feedback.
 */

import { useCallback, useMemo } from 'react';

export type ShareOutcome = 'shared' | 'copied' | 'failed';

export interface ShareData {
  title?: string;
  text?: string;
  url?: string;
}

export function useShare() {
  const canShare = useMemo(
    () => typeof navigator !== 'undefined' && typeof navigator.share === 'function',
    []
  );

  const share = useCallback(async (data: ShareData): Promise<ShareOutcome> => {
    if (canShare) {
      await navigator.share(data);
      return 'shared';
    }
    const flat = [data.text, data.url].filter(Boolean).join('\n');
    await navigator.clipboard.writeText(flat);
    return 'copied';
  }, [canShare]);

  return { canShare, share };
}

export default useShare;
