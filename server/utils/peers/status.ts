export const ONLINE_HANDSHAKE_SEC = 180

export type PeerOnlineStatus = 'online' | 'offline' | 'paused' | 'expired' | 'revoked'
export type PeerPausedReason = 'manual' | 'quiet_hours' | 'expired' | 'quota' | null

export interface QuietHoursConfig {
  days: number[]
  start: string
  end: string
  timezone: string
}

export function parseQuietHours(json: string | null | undefined): QuietHoursConfig | null {
  if (!json) return null
  try {
    const parsed = JSON.parse(json) as QuietHoursConfig
    if (!parsed || !Array.isArray(parsed.days) || !parsed.start || !parsed.end || !parsed.timezone) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function computeOnlineStatus(opts: {
  isActive: boolean
  paused: boolean
  pausedReason: string | null
  expiresAt: string | null
  latestHandshake: string | null
  now?: number
}): PeerOnlineStatus {
  if (!opts.isActive) return 'revoked'
  if (opts.expiresAt && new Date(opts.expiresAt).getTime() <= (opts.now ?? Date.now())) {
    return 'expired'
  }
  if (opts.paused) return 'paused'
  if (!opts.latestHandshake) return 'offline'
  const ageMs = (opts.now ?? Date.now()) - new Date(opts.latestHandshake).getTime()
  if (Number.isNaN(ageMs)) return 'offline'
  return ageMs <= ONLINE_HANDSHAKE_SEC * 1000 ? 'online' : 'offline'
}

export function normalizePausedReason(value: string | null | undefined): PeerPausedReason {
  if (value === 'manual' || value === 'quiet_hours' || value === 'expired' || value === 'quota') {
    return value
  }
  return null
}
