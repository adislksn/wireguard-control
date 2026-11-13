import { and, desc, eq } from 'drizzle-orm'
import { getDb } from '../../db'
import { collectorCursors, peerSnapshots, peers } from '../../db/schema'
import { computeOnlineStatus, normalizePausedReason, parseQuietHours } from '../../utils/peers/status'
import { getActiveVps } from '../../utils/vps/target'

function maskKey(key: string) {
  if (key.length < 12) return '***'
  return `${key.slice(0, 6)}…${key.slice(-4)}`
}

type QuotaStatusMap = Record<string, {
  usedBytes?: number
  warnReached?: boolean
  effectiveReason?: string | null
  paused?: boolean
}>

export default defineEventHandler(async (event) => {
  const vps = await getActiveVps()
  if (!vps) return []
  const includeRevoked = getQuery(event).includeRevoked === '1'
  const db = await getDb()
  const rows = await db.select().from(peers)
    .where(includeRevoked ? eq(peers.vpsId, vps.id) : and(eq(peers.vpsId, vps.id), eq(peers.isActive, true)))
    .orderBy(desc(peers.createdAt))

  const snaps = await db.select().from(peerSnapshots)
    .where(eq(peerSnapshots.vpsId, vps.id))
    .orderBy(desc(peerSnapshots.timestamp))

  const byKey = new Map<string, typeof peerSnapshots.$inferSelect>()
  for (const snap of snaps) {
    if (!byKey.has(snap.publicKey)) {
      byKey.set(snap.publicKey, snap)
    }
  }

  let quotaMap: QuotaStatusMap = {}
  const quotaCursor = (await db.select().from(collectorCursors)
    .where(and(eq(collectorCursors.vpsId, vps.id), eq(collectorCursors.kind, 'quota')))
    .limit(1))[0]
  if (quotaCursor?.cursor) {
    try {
      const parsed = JSON.parse(quotaCursor.cursor) as { peers?: QuotaStatusMap }
      quotaMap = parsed.peers || {}
    } catch {
      quotaMap = {}
    }
  }

  return rows.map((peer) => {
    const snap = byKey.get(peer.publicKey)
    const quota = quotaMap[peer.publicKey]
    const pausedReason = normalizePausedReason(peer.pausedReason)
    // Prefer VPS effective pause reason when present
    const effectiveReason = normalizePausedReason(quota?.effectiveReason) || pausedReason
    const paused = Boolean(peer.paused || quota?.paused)
    return {
      id: peer.id,
      deviceName: peer.deviceName,
      deviceType: peer.deviceType,
      description: peer.description,
      vpnIp: peer.vpnIp,
      publicKey: peer.publicKey,
      publicKeyMasked: maskKey(peer.publicKey),
      createdAt: peer.createdAt,
      revokedAt: peer.revokedAt,
      isActive: peer.isActive,
      paused,
      pausedReason: effectiveReason,
      expiresAt: peer.expiresAt,
      quietHoursEnabled: Boolean(peer.quietHoursEnabled),
      quietHours: parseQuietHours(peer.quietHoursJson),
      dailyCapBytes: peer.dailyCapBytes,
      quotaWarnPercent: peer.quotaWarnPercent ?? 80,
      latestHandshake: snap?.latestHandshake || null,
      rxBytes: snap?.rxBytes || 0,
      txBytes: snap?.txBytes || 0,
      onlineStatus: computeOnlineStatus({
        isActive: peer.isActive,
        paused,
        pausedReason: effectiveReason,
        expiresAt: peer.expiresAt,
        latestHandshake: snap?.latestHandshake || null
      }),
      quotaUsedBytes: Number(quota?.usedBytes || 0),
      quotaWarnReached: Boolean(quota?.warnReached)
    }
  })
})
