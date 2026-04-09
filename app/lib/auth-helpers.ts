import { createClient } from '@supabase/supabase-js';

// ─── SERVER-SIDE: Verify auth token and extract user ID ────────
//
// verifyAuth accepts ONE form of authentication: a Bearer JWT in the
// Authorization header. Previous versions also accepted x-user-id and
// userId query-param fallbacks for backward compatibility — both of
// which were spoofable and trivially impersonated any user. Those
// fallbacks were removed as part of the Session 3 auth hardening.
//
// Callers that need to identify the user server-side MUST send:
//   Authorization: Bearer <supabase_access_token>
//
// Client code should use the authFetch helper in app/lib/auth-fetch.ts
// which automatically attaches the current session's access token.

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || '';

export async function verifyAuth(req: Request): Promise<{ userId: string | null; error?: string }> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { userId: null, error: 'Missing or malformed Authorization header' };
  }

  const token = authHeader.slice(7);
  if (!supabaseUrl || !supabaseServiceKey) {
    return { userId: null, error: 'Auth verification not configured on server' };
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return { userId: null, error: error?.message || 'Invalid or expired token' };
    }
    return { userId: user.id };
  } catch (e: any) {
    return { userId: null, error: e?.message || 'Auth verification failed' };
  }
}
