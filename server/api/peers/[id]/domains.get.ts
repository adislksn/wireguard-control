import { and, desc, eq, gte } from 'drizzle-orm'
import { getDb } from '../../../db'
import { dnsQueries, peers } from '../../../db/schema'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const limit = Math.min(Number(getQuery(event).limit || 100), 500)
  const days = Number(getQuery(event).days || 7)
  const since = new Date(Date.now() - days * 86400000).toISOString()
  const db = await getDb()
  const peer = (await db.select().from(peers).where(eq(peers.id, id)).limit(1))[0]
  if (!peer) throw createError({ statusCode: 404, statusMessage: 'Peer not found' })

  return db.select().from(dnsQueries)
    .where(and(eq(dnsQueries.peerId, id), gte(dnsQueries.timestamp, since)))
    .orderBy(desc(dnsQueries.timestamp))
    .limit(limit)
})
