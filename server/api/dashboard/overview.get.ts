import { and, desc, eq, gte, sql } from 'drizzle-orm'
import { getDb } from '../../db'
import { adminAuditLogs, collectorCursors, dnsQueries, peerSnapshots, peers } from '../../db/schema'
import { getActiveVps, publicVpsView } from '../../utils/vps/target'

export default defineEventHandler(async () => {
  const vps = await getActiveVps()
  const db = await getDb()
  if (!vps) {
    return {
      vps: null,
      totals: { peers: 0, activePeers: 0, rxBytes: 0, txBytes: 0, dnsToday: 0 },
      health: null,
      recentAudit: [],
      connection: 'disconnected'
    }
  }

  const peerRows = await db.select().from(peers).where(eq(peers.vpsId, vps.id))
  const activePeers = peerRows.filter(p => p.isActive)
  const startOfDay = new Date()
  startOfDay.setUTCHours(0, 0, 0, 0)

  const dnsToday = await db.select({ count: sql<number>`count(*)` }).from(dnsQueries)
    .where(and(eq(dnsQueries.vpsId, vps.id), gte(dnsQueries.timestamp, startOfDay.toISOString())))

  const latestSnaps = await db.all(sql`
    SELECT public_key, rx_bytes, tx_bytes, latest_handshake FROM peer_snapshots
    WHERE vps_id = ${vps.id} AND id IN (
      SELECT MAX(id) FROM peer_snapshots WHERE vps_id = ${vps.id} GROUP BY public_key
    )
  `) as Array<{ public_key: string, rx_bytes: number, tx_bytes: number, latest_handshake: string | null }>

  const rx = latestSnaps.reduce((a, s) => a + (s.rx_bytes || 0), 0)
  const tx = latestSnaps.reduce((a, s) => a + (s.tx_bytes || 0), 0)
  const recentlyActive = latestSnaps.filter((s) => {
    if (!s.latest_handshake) return false
    return Date.now() - new Date(s.latest_handshake).getTime() < 5 * 60_000
  }).length

  const healthRow = (await db.select().from(collectorCursors)
    .where(and(eq(collectorCursors.vpsId, vps.id), eq(collectorCursors.kind, 'health')))
    .limit(1))[0]
  let health = null
  try {
    health = healthRow ? JSON.parse(healthRow.cursor) : null
  } catch {
    health = null
  }

  const recentAudit = await db.select().from(adminAuditLogs)
    .orderBy(desc(adminAuditLogs.timestamp))
    .limit(10)

  return {
    vps: publicVpsView(vps),
    totals: {
      peers: peerRows.length,
      activePeers: activePeers.length,
      recentlyActive,
      rxBytes: rx,
      txBytes: tx,
      dnsToday: Number(dnsToday[0]?.count || 0)
    },
    health,
    recentAudit,
    connection: vps.status
  }
})
