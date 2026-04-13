import { createContext, useContext, useState, ReactNode } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { deriveKEK, generateDEK, wrapDEK, unwrapDEK, fromBase64, toBase64 } from '@/lib/crypto'

interface CryptoContextValue {
  dek: CryptoKey | null
  isUnlocked: boolean
  unlockVault: (password: string, userId: string) => Promise<void>
  unlockVaultWithRecovery: (recoveryKey: string, userId: string) => Promise<void>
  createVaultKey: (password: string, userId: string) => Promise<string>
  lockVault: () => void
}

const CryptoContext = createContext<CryptoContextValue | null>(null)

export class VaultError extends Error {
  constructor(
    message: string,
    public readonly code: 'NO_KEY_ROW' | 'DECRYPT_FAILED' | 'NO_RECOVERY_KEY'
  ) {
    super(message)
  }
}

export function CryptoProvider({ children }: { children: ReactNode }) {
  const [dek, setDek] = useState<CryptoKey | null>(null)

  // Fetch the user_keys row — throws VaultError if missing
  const fetchKeyRow = async (userId: string) => {
    const { data, error } = await supabase
      .from('user_keys')
      .select('*')
      .eq('user_id', userId)
      .single()
    if (error || !data) throw new VaultError('No vault key found for this account', 'NO_KEY_ROW')
    return data
  }

  // Unlock with password (normal login)
  const unlockVault = async (password: string, userId: string) => {
    const keyRow = await fetchKeyRow(userId)
    try {
      const salt = fromBase64(keyRow.pbkdf2_salt)
      const iv = fromBase64(keyRow.dek_iv)
      const wrapped = fromBase64(keyRow.encrypted_dek)
      const kek = await deriveKEK(password, salt)
      const unwrapped = await unwrapDEK(wrapped.buffer.slice(wrapped.byteOffset, wrapped.byteOffset + wrapped.byteLength) as ArrayBuffer, kek, iv)
      setDek(unwrapped)
    } catch (e) {
      if (e instanceof VaultError) throw e
      throw new VaultError('Decryption failed — wrong password or corrupted key', 'DECRYPT_FAILED')
    }
  }

  // Unlock with the recovery key hex string
  const unlockVaultWithRecovery = async (recoveryKey: string, userId: string) => {
    const keyRow = await fetchKeyRow(userId)
    if (!keyRow.recovery_encrypted_dek) {
      throw new VaultError('No recovery key was stored for this account', 'NO_RECOVERY_KEY')
    }
    try {
      const { ciphertext, iv: ivB64, salt: saltB64 } = JSON.parse(keyRow.recovery_encrypted_dek) as {
        ciphertext: string; iv: string; salt: string
      }
      const salt = fromBase64(saltB64)
      const iv = fromBase64(ivB64)
      const wrapped = fromBase64(ciphertext)
      const kek = await deriveKEK(recoveryKey, salt)
      const unwrapped = await unwrapDEK(wrapped.buffer.slice(wrapped.byteOffset, wrapped.byteOffset + wrapped.byteLength) as ArrayBuffer, kek, iv)
      setDek(unwrapped)
    } catch (e) {
      if (e instanceof VaultError) throw e
      throw new VaultError('Recovery key is invalid or corrupted', 'DECRYPT_FAILED')
    }
  }

  // Create a brand-new vault key for the authenticated user (called at login if row is missing)
  // Returns the recovery key hex string
  const createVaultKey = async (password: string, userId: string): Promise<string> => {
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const kek = await deriveKEK(password, salt)
    const newDek = await generateDEK()
    const wrapped = await wrapDEK(newDek, kek, iv)

    // Also wrap the DEK with the recovery key
    const recoveryBytes = crypto.getRandomValues(new Uint8Array(32))
    const recoveryHex = Array.from(recoveryBytes).map((b) => b.toString(16).padStart(2, '0')).join('')
    const recSalt = crypto.getRandomValues(new Uint8Array(16))
    const recIv = crypto.getRandomValues(new Uint8Array(12))
    const recKek = await deriveKEK(recoveryHex, recSalt)
    const recWrapped = await wrapDEK(newDek, recKek, recIv)

    const { error } = await supabase.from('user_keys').upsert({
      user_id: userId,
      encrypted_dek: toBase64(wrapped),
      dek_iv: toBase64(iv),
      pbkdf2_salt: toBase64(salt),
      recovery_encrypted_dek: JSON.stringify({
        ciphertext: toBase64(recWrapped),
        iv: toBase64(recIv),
        salt: toBase64(recSalt),
      }),
    }, { onConflict: 'user_id' })

    if (error) throw new Error(`Failed to save vault key: ${error.message}`)
    setDek(newDek)
    return recoveryHex
  }

  const lockVault = () => setDek(null)

  return (
    <CryptoContext.Provider value={{ dek, isUnlocked: dek !== null, unlockVault, unlockVaultWithRecovery, createVaultKey, lockVault }}>
      {children}
    </CryptoContext.Provider>
  )
}

export function useCrypto(): CryptoContextValue {
  const ctx = useContext(CryptoContext)
  if (!ctx) throw new Error('useCrypto must be used inside CryptoProvider')
  return ctx
}
