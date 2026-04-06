import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://odpgrgyiivbcbbqcdkxm.supabase.co";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9kcGdyZ3lpaXZiY2JicWNka3htIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1MTA1MjcsImV4cCI6MjA4NjA4NjUyN30.PqDzDUIxav7F_dZbp_BWWRt4J1wUjugl2QOH7gxZz_A";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
