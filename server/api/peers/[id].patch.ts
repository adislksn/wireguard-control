import { eq } from 'drizzle-orm'
import { getDb } from '../../db'
import { peers } from '../../db/schema'
import { writeAudit } from '../../utils/audit'
import { syncPeerPolicies } from '../../utils/peers/policy'
import { getSettings } from '../../utils/settings'
import { peerUpdateSchema } from '../../utils/validation'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const body = peerUpdateSchema.parse(await readBody(event))
  const db = await getDb()
  const peer = (await db.select().from(peers).where(eq(peers.id, id)).limit(1))[0]
  if (!peer) throw createError({ statusCode: 404, statusMessage: 'Peer not found' })

  const settings = await getSettings()
  let quietHoursJson = peer.quietHoursJson
  if (body.quietHours !== undefined) {
    quietHoursJson = body.quietHours
      ? JSON.stringify({
          ...body.quietHours,
          timezone: body.quietHours.timezone || settings.timezone || 'UTC'
        })
      : null
  }

  await db.update(peers).set({
    deviceName: body.deviceName ?? peer.deviceName,
    deviceType: body.deviceType ?? peer.deviceType,
    description: body.description === undefined ? peer.description : body.description,
    expiresAt: body.expiresAt === undefined ? peer.expiresAt : body.expiresAt,
    quietHoursEnabled: body.quietHoursEnabled ?? peer.quietHoursEnabled,
    quietHoursJson,
    dailyCapBytes: body.dailyCapBytes === undefined ? peer.dailyCapBytes : body.dailyCapBytes,
    quotaWarnPercent: body.quotaWarnPercent ?? peer.quotaWarnPercent
  }).where(eq(peers.id, id))

  const policyTouched = body.expiresAt !== undefined
    || body.quietHoursEnabled !== undefined
    || body.quietHours !== undefined
    || body.dailyCapBytes !== undefined
    || body.quotaWarnPercent !== undefined

  if (policyTouched && peer.isActive) {
    try {
      await syncPeerPolicies(peer.vpsId)
    } catch (err: unknown) {
      await writeAudit({
        action: 'peer.policy.update',
        result: 'failure',
        vpsId: peer.vpsId,
        peerId: id,
        detail: { error: err instanceof Error ? err.message : String(err) }
      })
      throw createError({
        statusCode: 502,
        statusMessage: err instanceof Error ? err.message : 'policy sync failed'
      })
    }
  }

  await writeAudit({
    action: policyTouched ? 'peer.policy.update' : 'peer.update',
    result: 'success',
    vpsId: peer.vpsId,
    peerId: id,
    detail: body as Record<string, unknown>
  })

  return (await db.select().from(peers).where(eq(peers.id, id)))[0]
})
