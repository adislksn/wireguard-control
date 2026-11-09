import { and, eq, gte } from 'drizzle-orm'
import { getDb } from '../../../db'
import { peerSnapshots, peers } from '../../../db/schema'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const days = Number(getQuery(event).days || 7)
  const since = new Date(Date.now() - days * 86400000).toISOString()
  const db = await getDb()
  const peer = (await db.select().from(peers).where(eq(peers.id, id)).limit(1))[0]
  if (!peer) throw createError({ statusCode: 404, statusMessage: 'Peer not found' })

  const rows = await db.select().from(peerSnapshots)
    .where(and(eq(peerSnapshots.peerId, id), gte(peerSnapshots.timestamp, since)))
    .orderBy(peerSnapshots.timestamp)

  return rows.map(r => ({
    timestamp: r.timestamp,
    rxBytes: r.rxBytes,
    txBytes: r.txBytes,
    latestHandshake: r.latestHandshake
  }))
})
