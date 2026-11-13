import { and, desc, eq, or, sql } from 'drizzle-orm'
import { getDb } from '../../db'
import { collectorCursors, dnsQueries, peerSnapshots, peers } from '../../db/schema'
import { computeOnlineStatus, normalizePausedReason, parseQuietHours } from '../../utils/peers/status'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const db = await getDb()
  const peer = (await db.select().from(peers).where(eq(peers.id, id)).limit(1))[0]
  if (!peer) throw createError({ statusCode: 404, statusMessage: 'Peer not found' })

  const snaps = await db.select().from(peerSnapshots)
    .where(eq(peerSnapshots.peerId, id))
    .orderBy(desc(peerSnapshots.timestamp))
    .limit(1)

  const vpnIp = peer.vpnIp.split('/')[0]!
  const peerMatch = or(eq(dnsQueries.peerId, id), and(eq(dnsQueries.vpsId, peer.vpsId), eq(dnsQueries.clientIp, vpnIp)))

  const recentDns = await db.select().from(dnsQueries)
    .where(peerMatch)
    .orderBy(desc(dnsQueries.timestamp))
    .limit(20)

  const dnsCountRows = await db.select({ count: sql<number>`count(*)` })
    .from(dnsQueries)
    .where(peerMatch)

  let quotaUsedBytes = 0
  let quotaWarnReached = false
  let effectiveReason = normalizePausedReason(peer.pausedReason)
  let paused = Boolean(peer.paused)

  const quotaCursor = (await db.select().from(collectorCursors)
    .where(and(eq(collectorCursors.vpsId, peer.vpsId), eq(collectorCursors.kind, 'quota')))
    .limit(1))[0]
  if (quotaCursor?.cursor) {
    try {
      const parsed = JSON.parse(quotaCursor.cursor) as {
        peers?: Record<string, {
          usedBytes?: number
          warnReached?: boolean
          effectiveReason?: string | null
          paused?: boolean
        }>
      }
      const q = parsed.peers?.[peer.publicKey]
      if (q) {
        quotaUsedBytes = Number(q.usedBytes || 0)
        quotaWarnReached = Boolean(q.warnReached)
        effectiveReason = normalizePausedReason(q.effectiveReason) || effectiveReason
        paused = Boolean(q.paused || paused)
      }
    } catch {
      // ignore
    }
  }

  const latest = snaps[0] || null
  const onlineStatus = computeOnlineStatus({
    isActive: peer.isActive,
    paused,
    pausedReason: effectiveReason,
    expiresAt: peer.expiresAt,
    latestHandshake: latest?.latestHandshake || null
  })

  return {
    peer: {
      ...peer,
      paused,
      pausedReason: effectiveReason,
      quietHoursEnabled: Boolean(peer.quietHoursEnabled),
      quietHours: parseQuietHours(peer.quietHoursJson),
      quotaWarnPercent: peer.quotaWarnPercent ?? 80
    },
    latest,
    dnsQueryCount: Number(dnsCountRows[0]?.count || 0),
    recentDomains: recentDns,
    onlineStatus,
    quotaUsedBytes,
    quotaWarnReached
  }
})
