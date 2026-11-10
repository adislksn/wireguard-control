import { and, eq, or, sql } from 'drizzle-orm'
import { getDb } from '../../../db'
import { dnsQueries, peers } from '../../../db/schema'
import { writeAudit } from '../../../utils/audit'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const body = await readBody(event).catch(() => null)
  const confirm = getQuery(event).confirm === '1' || body?.confirm === true
  if (!confirm) {
    throw createError({ statusCode: 400, statusMessage: 'Confirmation required' })
  }
  if (!Number.isFinite(id) || id <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid peer id' })
  }

  const db = await getDb()
  const peer = (await db.select().from(peers).where(eq(peers.id, id)).limit(1))[0]
  if (!peer) throw createError({ statusCode: 404, statusMessage: 'Peer not found' })

  const vpnIp = peer.vpnIp.split('/')[0]!
  const peerMatch = or(
    eq(dnsQueries.peerId, id),
    and(eq(dnsQueries.vpsId, peer.vpsId), eq(dnsQueries.clientIp, vpnIp))
  )

  const before = await db.select({ count: sql<number>`count(*)` })
    .from(dnsQueries)
    .where(peerMatch)
  const deletedCount = Number(before[0]?.count || 0)

  await db.delete(dnsQueries).where(peerMatch)

  await writeAudit({
    action: 'peer.domains.delete',
    result: 'success',
    vpsId: peer.vpsId,
    peerId: id,
    detail: { deviceName: peer.deviceName, vpnIp, deletedCount }
  })

  return { ok: true, deletedCount }
})
