import { supabase } from './supabase-client';

// Get auth headers for API calls — includes JWT + x-user-id for backward compatibility
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = {};
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }
  if (session?.user?.id) {
    headers['x-user-id'] = session.user.id;
  }
  return headers;
}

// Authenticated fetch — automatically includes auth headers
export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const authHeaders = await getAuthHeaders();
  const headers = new Headers(options.headers || {});
  Object.entries(authHeaders).forEach(([k, v]) => headers.set(k, v));
  return fetch(url, { ...options, headers });
}
