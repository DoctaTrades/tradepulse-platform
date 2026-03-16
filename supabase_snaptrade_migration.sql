-- SnapTrade Integration: snaptrade_users table
-- Run this in your Supabase SQL Editor (https://odpgrgyiivbcbbqcdkxm.supabase.co)

CREATE TABLE IF NOT EXISTS snaptrade_users (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,           -- TradePulse auth user ID
  snap_user_id TEXT NOT NULL,             -- SnapTrade user ID (tp-{userId})
  user_secret TEXT NOT NULL,              -- SnapTrade user secret (sensitive)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookup by user_id
CREATE INDEX IF NOT EXISTS idx_snaptrade_users_user_id ON snaptrade_users(user_id);

-- RLS: Only service role can access (API routes use service key)
ALTER TABLE snaptrade_users ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role access" ON snaptrade_users
  FOR ALL USING (true) WITH CHECK (true);
