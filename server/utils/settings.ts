import { eq } from 'drizzle-orm'
import { getDb } from '../db'
import { appSettings } from '../db/schema'

export const DEFAULT_SETTINGS = {
  peerStatsIntervalSec: 60,
  dnsCollectIntervalSec: 30,
  healthIntervalSec: 300,
  dnsRetentionDays: 14,
  peerStatsRetentionDays: 90,
  timezone: 'UTC',
  upstreamDns: '1.1.1.1',
  /** Client profile DNS line (WireGuard). Use the VPN server IP so dnsmasq can log domains. */
  clientDns: '10.7.0.1'
}

export type AppSettings = typeof DEFAULT_SETTINGS

export async function getSettings(): Promise<AppSettings> {
  const db = await getDb()
  const rows = await db.select().from(appSettings)
  const map = Object.fromEntries(rows.map(r => [r.key, r.value]))
  return {
    peerStatsIntervalSec: Number(map.peerStatsIntervalSec ?? DEFAULT_SETTINGS.peerStatsIntervalSec),
    dnsCollectIntervalSec: Number(map.dnsCollectIntervalSec ?? DEFAULT_SETTINGS.dnsCollectIntervalSec),
    healthIntervalSec: Number(map.healthIntervalSec ?? DEFAULT_SETTINGS.healthIntervalSec),
    dnsRetentionDays: Number(map.dnsRetentionDays ?? DEFAULT_SETTINGS.dnsRetentionDays),
    peerStatsRetentionDays: Number(map.peerStatsRetentionDays ?? DEFAULT_SETTINGS.peerStatsRetentionDays),
    timezone: map.timezone || DEFAULT_SETTINGS.timezone,
    upstreamDns: map.upstreamDns || DEFAULT_SETTINGS.upstreamDns,
    clientDns: map.clientDns || DEFAULT_SETTINGS.clientDns
  }
}

export async function patchSettings(partial: Partial<AppSettings>) {
  const db = await getDb()
  const now = new Date().toISOString()
  for (const [key, value] of Object.entries(partial)) {
    if (value === undefined) continue
    await db
      .insert(appSettings)
      .values({ key, value: String(value), updatedAt: now })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value: String(value), updatedAt: now }
      })
  }
  return getSettings()
}

export async function getSetting(key: string) {
  const db = await getDb()
  const rows = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1)
  return rows[0]?.value
}
