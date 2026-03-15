import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://odpgrgyiivbcbbqcdkxm.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Use service_role key for server-side operations (token storage)
export const supabase = supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey) : null as any;
