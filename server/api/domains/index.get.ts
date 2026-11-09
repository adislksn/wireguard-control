import { and, desc, eq, gte, like } from 'drizzle-orm'
import { getDb } from '../../db'
import { dnsQueries, peers } from '../../db/schema'
import { getActiveVps } from '../../utils/vps/target'

export default defineEventHandler(async (event) => {
  const vps = await getActiveVps()
  if (!vps) return { items: [], total: 0, disclaimer: disclaimer() }

  const q = getQuery(event)
  const search = String(q.search || '').trim()
  const peerId = q.peerId ? Number(q.peerId) : null
  const page = Math.max(Number(q.page || 1), 1)
  const pageSize = Math.min(Math.max(Number(q.pageSize || 50), 1), 200)
  const days = Number(q.days || 14)
  const since = new Date(Date.now() - days * 86400000).toISOString()

  const db = await getDb()
  const conditions = [eq(dnsQueries.vpsId, vps.id), gte(dnsQueries.timestamp, since)]
  if (peerId) conditions.push(eq(dnsQueries.peerId, peerId))
  if (search) conditions.push(like(dnsQueries.domain, `%${search.replace(/[%_]/g, '')}%`))

  const rows = await db.select({
    id: dnsQueries.id,
    timestamp: dnsQueries.timestamp,
    clientIp: dnsQueries.clientIp,
    domain: dnsQueries.domain,
    recordType: dnsQueries.recordType,
    peerId: dnsQueries.peerId,
    deviceName: peers.deviceName
  })
    .from(dnsQueries)
    .leftJoin(peers, eq(dnsQueries.peerId, peers.id))
    .where(and(...conditions))
    .orderBy(desc(dnsQueries.timestamp))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  return {
    items: rows,
    page,
    pageSize,
    disclaimer: disclaimer()
  }
})

function disclaimer() {
  return 'DNS lookups only, not full browsing history. Clients must use VPN DNS (10.7.0.1). DoH/DoT, Android Private DNS, app DNS, and cached queries may be invisible.'
}
