-- user_keys: stores each user's wrapped Data Encryption Key (DEK)
-- Applied via scripts/migrate.mjs using the Supabase Management API

CREATE TABLE IF NOT EXISTS public.user_keys (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  encrypted_dek   TEXT NOT NULL,
  dek_iv          TEXT NOT NULL,
  pbkdf2_salt     TEXT NOT NULL,
  recovery_encrypted_dek TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.user_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own key"
  ON public.user_keys FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can select their own key"
  ON public.user_keys FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own key"
  ON public.user_keys FOR UPDATE
  USING (auth.uid() = user_id);
