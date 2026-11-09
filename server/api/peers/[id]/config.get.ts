import { eq } from 'drizzle-orm'
import { getDb } from '../../../db'
import { peers, vpsHosts } from '../../../db/schema'
import { writeAudit } from '../../../utils/audit'
import { runHelper } from '../../../utils/ssh/client'
import { buildSshTarget } from '../../../utils/vps/target'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const db = await getDb()
  const peer = (await db.select().from(peers).where(eq(peers.id, id)).limit(1))[0]
  if (!peer) {
    throw createError({ statusCode: 404, statusMessage: 'Peer not found' })
  }
  if (!peer.isActive) {
    throw createError({ statusCode: 400, statusMessage: 'Peer is revoked' })
  }

  const vps = (await db.select().from(vpsHosts).where(eq(vpsHosts.id, peer.vpsId)).limit(1))[0]
  if (!vps) {
    throw createError({ statusCode: 404, statusMessage: 'VPS not found' })
  }

  const target = await buildSshTarget(vps)
  const result = await runHelper<{
    ok: boolean
    data?: { clientConfig: string }
    error?: string
  }>(target, 'wg-peer-config', { publicKey: peer.publicKey })

  if (!result.data?.ok || !result.data.data?.clientConfig) {
    await writeAudit({
      action: 'peer.config.read',
      result: 'failure',
      vpsId: vps.id,
      peerId: id,
      detail: { error: result.data?.error || 'missing' }
    })
    throw createError({
      statusCode: 404,
      statusMessage: result.data?.error || 'Client config not available. Revoke and recreate this peer to generate a new config.'
    })
  }

  await writeAudit({
    action: 'peer.config.read',
    result: 'success',
    vpsId: vps.id,
    peerId: id,
    detail: { deviceName: peer.deviceName }
  })

  return {
    deviceName: peer.deviceName,
    vpnIp: peer.vpnIp,
    clientConfig: result.data.data.clientConfig
  }
})
