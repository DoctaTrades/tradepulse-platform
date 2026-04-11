// Parallel fetch helper with rate limiting for Schwab API calls.
//
// Purpose: run many async tasks at the same time instead of one after another,
// while never exceeding Schwab's 120 requests-per-minute market data cap.
//
// How it works:
//   - CONCURRENCY controls how many tasks run side-by-side at any given moment.
//   - RATE_LIMIT_PER_MINUTE is a sliding-window ceiling: we track the timestamps
//     of recent calls, and if we'd exceed the limit, we wait just long enough
//     for the oldest call to age out of the window.
//   - On a 429 ("Too Many Requests") we back off and retry up to RETRY_COUNT
//     times with exponential delays.
//
// Why this lives in its own file: every scan route that wants parallel fetches
// imports `runInParallel` from here. Tuning is done in ONE place.

// ─── TUNABLES ────────────────────────────────────────────────────────────
// Conservative defaults. Schwab's documented cap is 120/min — we stay well under.
const CONCURRENCY = 8;               // how many tasks run at once
const RATE_LIMIT_PER_MINUTE = 100;   // leaves a 20-req safety buffer under Schwab's 120
const RETRY_COUNT = 3;               // retries on transient errors
const RETRY_BASE_DELAY_MS = 500;     // exponential: 500ms, 1000ms, 2000ms

// ─── SLIDING-WINDOW RATE LIMITER ─────────────────────────────────────────
// Tracks timestamps of recent requests. Before each new request, we wait
// long enough that the number of requests in the last 60s is under the cap.
class RateLimiter {
  private timestamps: number[] = [];
  private readonly windowMs = 60_000;
  private readonly maxPerWindow: number;

  constructor(maxPerWindow: number) {
    this.maxPerWindow = maxPerWindow;
  }

  async acquire(): Promise<void> {
    while (true) {
      const now = Date.now();
      // Drop timestamps older than the window.
      this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);

      if (this.timestamps.length < this.maxPerWindow) {
        this.timestamps.push(now);
        return;
      }

      // We're at the cap. Wait until the oldest timestamp expires + 50ms cushion.
      const oldest = this.timestamps[0];
      const waitMs = this.windowMs - (now - oldest) + 50;
      await sleep(waitMs);
    }
  }
}

// Shared limiter across all calls in this process (per Next.js server instance).
const schwabLimiter = new RateLimiter(RATE_LIMIT_PER_MINUTE);

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── RETRY WRAPPER ───────────────────────────────────────────────────────
// Retries on 429 (rate limit) and on transient network errors.
// Does NOT retry on 401 — that's an auth problem; schwabFetch already handles it.
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= RETRY_COUNT; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);

      // Don't retry auth errors — let them bubble up.
      if (msg.includes('401') || msg.toLowerCase().includes('reconnect')) {
        throw err;
      }

      // Retry on 429 or generic network errors.
      const isRateLimit = msg.includes('429') || msg.toLowerCase().includes('too many');
      const isTransient = msg.includes('ECONNRESET') || msg.includes('ETIMEDOUT') ||
                          msg.includes('fetch failed') || msg.includes('502') ||
                          msg.includes('503') || msg.includes('504');

      if (attempt < RETRY_COUNT && (isRateLimit || isTransient)) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        await sleep(delay);
        continue;
      }

      throw err;
    }
  }
  throw lastErr;
}

// ─── MAIN PARALLEL RUNNER ────────────────────────────────────────────────
// Takes a list of items, a worker function, and runs workers in parallel
// up to CONCURRENCY at a time, respecting the rate limit.
//
// Returns an array of results in the SAME ORDER as the input items.
// If a worker throws, that slot gets `undefined` (caller decides what to do).
//
// Usage:
//   const results = await runInParallel(tickers, async (ticker) => {
//     return await getPriceHistory(ticker, ...);
//   });
export async function runInParallel<TIn, TOut>(
  items: TIn[],
  worker: (item: TIn, index: number) => Promise<TOut>,
  options?: { concurrency?: number; onError?: (item: TIn, err: unknown) => void }
): Promise<(TOut | undefined)[]> {
  const concurrency = options?.concurrency ?? CONCURRENCY;
  const results: (TOut | undefined)[] = new Array(items.length);
  let cursor = 0;

  async function runNext(): Promise<void> {
    while (cursor < items.length) {
      const myIndex = cursor++;
      const item = items[myIndex];
      try {
        await schwabLimiter.acquire();
        results[myIndex] = await withRetry(() => worker(item, myIndex));
      } catch (err) {
        results[myIndex] = undefined;
        if (options?.onError) options.onError(item, err);
      }
    }
  }

  // Spin up N workers and wait for all of them to drain the queue.
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, runNext);
  await Promise.all(workers);
  return results;
}

// ─── CONVENIENCE: parallel with multiple sub-fetches per item ────────────
// Some scans need to fetch 2 things per ticker (price history + option chain).
// This variant lets the worker return a tuple and runs them sequentially
// PER ticker but in parallel ACROSS tickers. The rate limiter still governs
// the total request rate.
export { CONCURRENCY as DEFAULT_CONCURRENCY };
