export interface VpsHost {
  id: number
  name: string
  host: string
  sshPort: number
  sshUser: string
  authType: string
  hasPrivateKey: boolean
  hostFingerprint: string | null
  wgInterface: string | null
  wgSubnet: string | null
  serverVpnIp: string | null
  listenPort: number | null
  status: 'unknown' | 'reachable' | 'no_wireguard' | 'ready' | 'error'
  lastError: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export type PeerOnlineStatus = 'online' | 'offline' | 'paused' | 'expired' | 'revoked'
export type PeerPausedReason = 'manual' | 'quiet_hours' | 'expired' | 'quota' | null

export interface QuietHoursConfig {
  days: number[]
  start: string
  end: string
  timezone: string
}

export interface PeerRow {
  id: number
  deviceName: string
  deviceType: string | null
  description: string | null
  vpnIp: string
  publicKey: string
  publicKeyMasked: string
  createdAt: string
  revokedAt: string | null
  isActive: boolean
  paused: boolean
  pausedReason: PeerPausedReason
  expiresAt: string | null
  quietHoursEnabled: boolean
  quietHours: QuietHoursConfig | null
  dailyCapBytes: number | null
  quotaWarnPercent: number
  latestHandshake: string | null
  rxBytes: number
  txBytes: number
  onlineStatus: PeerOnlineStatus
  quotaUsedBytes: number
  quotaWarnReached: boolean
}

export interface DashboardOverview {
  vps: VpsHost | null
  totals: {
    peers: number
    activePeers: number
    recentlyActive?: number
    rxBytes: number
    txBytes: number
    dnsToday: number
  }
  health: {
    memory?: { usedPercent: number, used: number, total: number }
    cpu?: { load1: number }
    disk?: { usedPercent: number }
    uptimeSec?: number
  } | null
  recentAudit: Array<{
    id: number
    timestamp: string
    action: string
    result: string
    detail: string | null
  }>
  connection: string
}
