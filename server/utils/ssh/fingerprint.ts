import { createHash } from 'node:crypto'

/** OpenSSH SHA256 fingerprint from host key blob (base64). */
export function fingerprintFromKey(key: Buffer, type: string) {
  const digest = createHash('sha256').update(key).digest('base64').replace(/=+$/, '')
  return `${type.toUpperCase()} SHA256:${digest}`
}

export function normalizeFingerprint(value: string) {
  return value.trim().replace(/^SHA256:/i, 'SHA256:')
}

export function fingerprintsMatch(expected: string | null | undefined, actual: string) {
  if (!expected) {
    return true
  }
  const a = normalizeFingerprint(expected).toLowerCase()
  const b = normalizeFingerprint(actual).toLowerCase()
  return a === b || a.endsWith(b.replace(/^[^:]+:/i, '')) || b.endsWith(a.replace(/^[^:]+:/i, ''))
}
