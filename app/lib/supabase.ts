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
// For those paths, use a raw fetch() to Supabase REST API with explicit
// cache: 'no-store'. See dbLoadRow in app/lib/schwab-auth.ts for the pattern.

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || '';

// Use service_role key for server-side operations — never fall back to anon key
export const supabase = (supabaseUrl && supabaseServiceKey) ? createClient(supabaseUrl, supabaseServiceKey) : null as any;
