import { liveQuery } from 'dexie';

export interface RetryConfig {
  maxRetries: number;
  backoffMs: number[];
}

const DEFAULT_CONFIG: RetryConfig = {
  maxRetries: 3,
  backoffMs: [1000, 2000, 4000]
};

export function createRetryableSubscription<T>(
  queryFn: () => Promise<T>,
  onNext: (data: T) => void,
  onError: (error: Error) => void,
  config: RetryConfig = DEFAULT_CONFIG
): () => void {
  let retryCount = 0;
  let currentTimeout: number | null = null;
  let subscription: { unsubscribe: () => void } | null = null;
  let closed = false;

  const attemptQuery = () => {
    if (closed) return;
    subscription = liveQuery(queryFn).subscribe({
      next: (data) => {
        retryCount = 0;
        onNext(data);
      },
      error: (error) => {
        if (retryCount < config.maxRetries) {
          console.warn(`liveQuery failed — retry ${retryCount + 1}/${config.maxRetries}:`, error);

          const delay = config.backoffMs[retryCount] || config.backoffMs[config.backoffMs.length - 1];
          retryCount++;
          currentTimeout = window.setTimeout(() => {
            attemptQuery();
          }, delay);
        } else {
          console.warn(`liveQuery failed — giving up after ${config.maxRetries} retries:`, error);
          onError(error as Error);
        }
      }
    });
  };

  attemptQuery();

  return () => {
    closed = true;
    subscription?.unsubscribe();
    if (currentTimeout !== null) {
      clearTimeout(currentTimeout);
    }
  };
}
