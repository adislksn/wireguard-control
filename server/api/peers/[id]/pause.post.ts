import { eq } from 'drizzle-orm'
import { getDb } from '../../../db'
import { peers, vpsHosts } from '../../../db/schema'
import { writeAudit } from '../../../utils/audit'
import { syncPeerPolicies } from '../../../utils/peers/policy'
import { runHelper } from '../../../utils/ssh/client'
import { buildSshTarget } from '../../../utils/vps/target'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const db = await getDb()
  const peer = (await db.select().from(peers).where(eq(peers.id, id)).limit(1))[0]
  if (!peer) throw createError({ statusCode: 404, statusMessage: 'Peer not found' })
  if (!peer.isActive) throw createError({ statusCode: 400, statusMessage: 'Peer is revoked' })

  const vps = (await db.select().from(vpsHosts).where(eq(vpsHosts.id, peer.vpsId)).limit(1))[0]
  if (!vps) throw createError({ statusCode: 404, statusMessage: 'VPS not found' })

  await db.update(peers).set({
    paused: true,
    pausedReason: 'manual'
  }).where(eq(peers.id, id))

  const target = await buildSshTarget(vps)
  const result = await runHelper<{ ok: boolean, error?: string }>(target, 'wg-peer-pause', {
    name: peer.deviceName,
    publicKey: peer.publicKey,
    interface: vps.wgInterface || 'wg0'
  })

  if (!result.data?.ok) {
    await writeAudit({
      action: 'peer.pause',
      result: 'failure',
      vpsId: vps.id,
      peerId: id,
      detail: { error: result.data?.error }
    })
    throw createError({ statusCode: 502, statusMessage: result.data?.error || 'pause failed' })
  }

  try {
    await syncPeerPolicies(vps.id)
  } catch {
    // pause already applied; sync best-effort for timer state
  }

  await writeAudit({
    action: 'peer.pause',
    result: 'success',
    vpsId: vps.id,
    peerId: id,
    detail: { deviceName: peer.deviceName, reason: 'manual' }
  })

  return (await db.select().from(peers).where(eq(peers.id, id)))[0]
})
