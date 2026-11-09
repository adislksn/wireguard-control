import { and, desc, eq } from 'drizzle-orm'
import { getDb } from '../../db'
import { peerSnapshots, peers } from '../../db/schema'
import { getActiveVps } from '../../utils/vps/target'

function maskKey(key: string) {
  if (key.length < 12) return '***'
  return `${key.slice(0, 6)}…${key.slice(-4)}`
}

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

  return rows.map((peer) => {
    const snap = byKey.get(peer.publicKey)
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
      latestHandshake: snap?.latestHandshake || null,
      rxBytes: snap?.rxBytes || 0,
      txBytes: snap?.txBytes || 0
    }
  })
})
