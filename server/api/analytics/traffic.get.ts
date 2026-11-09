import { and, eq, gte, sql } from 'drizzle-orm'
import { getDb } from '../../db'
import { peerSnapshots, peers } from '../../db/schema'
import { getActiveVps } from '../../utils/vps/target'

export default defineEventHandler(async (event) => {
  const vps = await getActiveVps()
  if (!vps) return { series: [], byPeer: [] }

  const days = Number(getQuery(event).days || 7)
  const since = new Date(Date.now() - days * 86400000).toISOString()
  const db = await getDb()

  const rows = await db.select({
    day: sql<string>`substr(timestamp, 1, 10)`,
    rx: sql<number>`max(rx_bytes)`,
    tx: sql<number>`max(tx_bytes)`,
    publicKey: peerSnapshots.publicKey
  })
    .from(peerSnapshots)
    .where(and(eq(peerSnapshots.vpsId, vps.id), gte(peerSnapshots.timestamp, since)))
    .groupBy(sql`substr(timestamp, 1, 10)`, peerSnapshots.publicKey)

  const dayMap = new Map<string, { date: string, rxBytes: number, txBytes: number }>()
  for (const row of rows) {
    const cur = dayMap.get(row.day) || { date: row.day, rxBytes: 0, txBytes: 0 }
    cur.rxBytes += Number(row.rx || 0)
    cur.txBytes += Number(row.tx || 0)
    dayMap.set(row.day, cur)
  }

  const peerRows = await db.select().from(peers).where(eq(peers.vpsId, vps.id))
  const nameByKey = new Map(peerRows.map(p => [p.publicKey, p.deviceName]))

  const byPeerMap = new Map<string, { deviceName: string, publicKey: string, rxBytes: number, txBytes: number }>()
  for (const row of rows) {
    const cur = byPeerMap.get(row.publicKey) || {
      deviceName: nameByKey.get(row.publicKey) || row.publicKey.slice(0, 8),
      publicKey: row.publicKey,
      rxBytes: 0,
      txBytes: 0
    }
    cur.rxBytes = Math.max(cur.rxBytes, Number(row.rx || 0))
    cur.txBytes = Math.max(cur.txBytes, Number(row.tx || 0))
    byPeerMap.set(row.publicKey, cur)
  }

  return {
    series: [...dayMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
    byPeer: [...byPeerMap.values()]
  }
})
