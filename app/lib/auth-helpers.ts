import { createClient } from '@supabase/supabase-js';

// ─── SERVER-SIDE: Verify auth token and extract user ID ────────
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || '';

export async function verifyAuth(req: Request): Promise<{ userId: string | null; error?: string }> {
  // Try Authorization header first (secure JWT method)
  const authHeader = req.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    if (supabaseUrl && supabaseServiceKey) {
      try {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (!error && user) return { userId: user.id };
      } catch {}
    }
  }

  // Fallback: x-user-id header (backward compatibility)
  const headerUserId = req.headers.get('x-user-id');
  if (headerUserId) return { userId: headerUserId };

  // Fallback: query param
  const url = new URL(req.url);
  const paramUserId = url.searchParams.get('userId');
  if (paramUserId) return { userId: paramUserId };

  return { userId: null, error: 'No authentication provided' };
}
