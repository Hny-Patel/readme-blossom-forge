-- Encrypted columns for accounts table
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS name_enc   TEXT,
  ADD COLUMN IF NOT EXISTS name_iv    TEXT,
  ADD COLUMN IF NOT EXISTS phone_enc  TEXT,
  ADD COLUMN IF NOT EXISTS phone_iv   TEXT,
  ADD COLUMN IF NOT EXISTS email_enc  TEXT,
  ADD COLUMN IF NOT EXISTS email_iv   TEXT,
  ADD COLUMN IF NOT EXISTS notes_enc  TEXT,
  ADD COLUMN IF NOT EXISTS notes_iv   TEXT;

-- Encrypted columns for businesses table
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS name_enc    TEXT,
  ADD COLUMN IF NOT EXISTS name_iv     TEXT,
  ADD COLUMN IF NOT EXISTS gstin_enc   TEXT,
  ADD COLUMN IF NOT EXISTS gstin_iv    TEXT,
  ADD COLUMN IF NOT EXISTS address_enc TEXT,
  ADD COLUMN IF NOT EXISTS address_iv  TEXT;
