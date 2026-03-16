-- Per-user Schwab API credentials and tokens
-- Each user brings their own Schwab developer App Key + Secret
-- Tokens are managed automatically via OAuth flow

CREATE TABLE IF NOT EXISTS user_schwab_credentials (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  app_key TEXT NOT NULL,
  app_secret TEXT NOT NULL,
  callback_url TEXT,
  access_token TEXT,
  refresh_token TEXT,
  access_expires_at BIGINT,
  refresh_expires_at BIGINT,
  connected_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: users can only access their own row
ALTER TABLE user_schwab_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own credentials"
  ON user_schwab_credentials FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own credentials"
  ON user_schwab_credentials FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own credentials"
  ON user_schwab_credentials FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own credentials"
  ON user_schwab_credentials FOR DELETE
  USING (auth.uid() = user_id);

-- Also allow service_role (server-side) full access for token refresh operations
-- Service role key bypasses RLS by default, so no policy needed
