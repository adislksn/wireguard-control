import { eq } from 'drizzle-orm'
import { getDb } from '../../db'
import { peers } from '../../db/schema'
import { writeAudit } from '../../utils/audit'
import { peerUpdateSchema } from '../../utils/validation'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const body = peerUpdateSchema.parse(await readBody(event))
  const db = await getDb()
  const peer = (await db.select().from(peers).where(eq(peers.id, id)).limit(1))[0]
  if (!peer) throw createError({ statusCode: 404, statusMessage: 'Peer not found' })

  await db.update(peers).set({
    deviceName: body.deviceName ?? peer.deviceName,
    deviceType: body.deviceType ?? peer.deviceType,
    description: body.description === undefined ? peer.description : body.description
  }).where(eq(peers.id, id))

  await writeAudit({ action: 'peer.update', result: 'success', vpsId: peer.vpsId, peerId: id, detail: body })
  return (await db.select().from(peers).where(eq(peers.id, id)))[0]
})
