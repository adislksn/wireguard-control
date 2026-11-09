import { and, desc, eq, or, sql } from 'drizzle-orm'
import { getDb } from '../../db'
import { dnsQueries, peerSnapshots, peers } from '../../db/schema'

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

  return {
    peer,
    latest: snaps[0] || null,
    dnsQueryCount: Number(dnsCountRows[0]?.count || 0),
    recentDomains: recentDns
  }
})
