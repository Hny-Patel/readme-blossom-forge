-- Add encrypted columns to transactions table (backward-compatible)
-- Old rows keep plain amount/notes; new rows write both plain + encrypted during migration period

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS amount_enc  TEXT,
  ADD COLUMN IF NOT EXISTS amount_iv   TEXT,
  ADD COLUMN IF NOT EXISTS notes_enc   TEXT,
  ADD COLUMN IF NOT EXISTS notes_iv    TEXT;
