-- Migration: Add encrypted columns to transactions table
-- Applied via Supabase SQL Editor

ALTER TABLE public.transactions 
ADD COLUMN amount_enc TEXT,
ADD COLUMN amount_iv TEXT,
ADD COLUMN notes_enc TEXT,
ADD COLUMN notes_iv TEXT;

-- Comments for documentation
COMMENT ON COLUMN public.transactions.amount_enc IS 'AES-GCM encrypted balance amount (base64)';
COMMENT ON COLUMN public.transactions.amount_iv IS 'Initialization vector for amount encryption (base64)';
COMMENT ON COLUMN public.transactions.notes_enc IS 'AES-GCM encrypted notes (base64)';
COMMENT ON COLUMN public.transactions.notes_iv IS 'Initialization vector for notes encryption (base64)';
