import { createClient } from '@supabase/supabase-js';

// WARNING: This singleton Supabase client goes through Next.js's patched
// global fetch. In Next.js 14, fetch() calls from route handlers are cached
// by the Next.js Data Cache by default, which means reads from this client
// may return stale data even when the underlying database row has been
// updated by a prior write in the same conversation. This caused a
// months-long Schwab token refresh bug in April 2026.
//
// SAFE for: writes, reads where staleness is acceptable, reads that aren't
// racing against recent writes (sector lists, ticker universes, etc).
//
// NOT SAFE for: reads where you just wrote data and need to read it back.
// For those paths, use supabaseFreshRead() exported from this file.

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || '';

// Use service_role key for server-side operations — never fall back to anon key
export const supabase = (supabaseUrl && supabaseServiceKey) ? createClient(supabaseUrl, supabaseServiceKey) : null as any;

// ─── FRESH READ HELPER ──────────────────────────────────────────────────────
// Bypasses the Supabase JS client and Next.js Data Cache entirely.
// Use this for any read where you need guaranteed-fresh data — especially
// reads that follow a recent write to the same table.
//
// Usage:
//   const row = await supabaseFreshRead('user_schwab_credentials',
//     'app_key,app_secret,access_token',
//     { user_id: `eq.${userId}` },
//     { single: true }
//   );
//
// Filters use PostgREST syntax: { column: 'operator.value' }
//   eq, neq, gt, gte, lt, lte, like, ilike, is, in, not
//   Example: { user_id: 'eq.abc-123', granted: 'eq.true' }

interface FreshReadOptions {
  single?: boolean;  // true = return first row or null; false = return array
}

export async function supabaseFreshRead<T = Record<string, any>>(
  table: string,
  columns: string,
  filters?: Record<string, string>,
  options?: FreshReadOptions,
): Promise<T | T[] | null> {
  if (!supabaseUrl || !supabaseServiceKey) {
    console.log('[SUPABASE] fresh-read-config-error', JSON.stringify({ table, hasUrl: !!supabaseUrl, hasKey: !!supabaseServiceKey }));
    return options?.single ? null : [];
  }

  // Build PostgREST URL: /rest/v1/table?select=columns&filter1=value1&filter2=value2
  const params = new URLSearchParams({ select: columns });
  if (filters) {
    for (const [col, condition] of Object.entries(filters)) {
      params.append(col, condition);
    }
  }

  const url = `${supabaseUrl}/rest/v1/${encodeURIComponent(table)}?${params.toString()}`;

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Accept': 'application/json',
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      console.log('[SUPABASE] fresh-read-error', JSON.stringify({
        table,
        status: res.status,
        filters: filters || {},
      }));
      return options?.single ? null : [];
    }

    const rows = await res.json() as T[];
    if (!Array.isArray(rows)) return options?.single ? null : [];

    if (options?.single) {
      return rows.length > 0 ? rows[0] : null;
    }
    return rows;
  } catch (e) {
    console.log('[SUPABASE] fresh-read-exception', JSON.stringify({
      table,
      error: (e as Error).message,
    }));
    return options?.single ? null : [];
  }
}
