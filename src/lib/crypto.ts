// Web Crypto API — no external library
// All functions are async and browser-native

export function toBase64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

export function fromBase64(str: string): Uint8Array {
  const binary = atob(str)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

export async function deriveKEK(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const passwordBuffer = new TextEncoder().encode(password)
  const baseKey = await crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    'PBKDF2',
    false,
    ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 310_000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey']
  )
}

export async function generateDEK(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  )
}

export async function wrapDEK(
  dek: CryptoKey,
  kek: CryptoKey,
  iv: Uint8Array
): Promise<ArrayBuffer> {
  return crypto.subtle.wrapKey('raw', dek, kek, { name: 'AES-GCM', iv })
}

export async function unwrapDEK(
  wrapped: ArrayBuffer,
  kek: CryptoKey,
  iv: Uint8Array
): Promise<CryptoKey> {
  return crypto.subtle.unwrapKey(
    'raw',
    wrapped,
    kek,
    { name: 'AES-GCM', iv },
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

export async function encryptField(
  plaintext: string,
  dek: CryptoKey
): Promise<{ ciphertext: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(plaintext)
  const ciphertextBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, dek, encoded)
  return {
    ciphertext: toBase64(ciphertextBuf),
    iv: toBase64(iv),
  }
}

export async function decryptField(
  ciphertext: string,
  iv: string,
  dek: CryptoKey
): Promise<string> {
  const ciphertextBuf = fromBase64(ciphertext)
  const ivBuf = fromBase64(iv)
  const plaintextBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBuf },
    dek,
    ciphertextBuf
  )
  return new TextDecoder().decode(plaintextBuf)
}
