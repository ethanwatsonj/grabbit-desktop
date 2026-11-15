import { safeStorage } from 'electron'
import fs from 'fs'
import path from 'path'
import { appSupportDir } from './paths'

const SECRET_FILE = 'gemini-api-key.enc'
const LEGACY_HINT = 'legacy-keychain-migrated'

function secretPath(): string {
  return path.join(appSupportDir(), SECRET_FILE)
}

function legacyFlagPath(): string {
  return path.join(appSupportDir(), LEGACY_HINT)
}

export function getGeminiApiKey(): string | null {
  const p = secretPath()
  if (!fs.existsSync(p)) return null
  if (!safeStorage.isEncryptionAvailable()) {
    const raw = fs.readFileSync(p, 'utf8').trim()
    return raw || null
  }
  const buf = fs.readFileSync(p)
  try {
    const text = safeStorage.decryptString(buf).trim()
    return text || null
  } catch {
    return null
  }
}

export function setGeminiApiKey(key: string | null): void {
  const p = secretPath()
  if (!key) {
    if (fs.existsSync(p)) fs.unlinkSync(p)
    return
  }
  const trimmed = key.trim()
  if (!trimmed) {
    setGeminiApiKey(null)
    return
  }
  if (!safeStorage.isEncryptionAvailable()) {
    fs.writeFileSync(p, trimmed, 'utf8')
    return
  }
  fs.writeFileSync(p, safeStorage.encryptString(trimmed))
}

export function markLegacyKeychainMigrated(): void {
  fs.writeFileSync(legacyFlagPath(), new Date().toISOString(), 'utf8')
}

export function wasLegacyKeychainMigrated(): boolean {
  return fs.existsSync(legacyFlagPath())
}
