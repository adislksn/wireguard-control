import { eq } from 'drizzle-orm'
import { getDb } from '../../db'
import { peers, vpsHosts } from '../../db/schema'
import { writeAudit } from '../../utils/audit'
import { runHelper } from '../../utils/ssh/client'
import { buildSshTarget } from '../../utils/vps/target'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const confirm = getQuery(event).confirm === '1' || (await readBody(event).catch(() => null))?.confirm === true
  if (!confirm) {
    throw createError({ statusCode: 400, statusMessage: 'Confirmation required' })
  }

  const db = await getDb()
  const peer = (await db.select().from(peers).where(eq(peers.id, id)).limit(1))[0]
  if (!peer) throw createError({ statusCode: 404, statusMessage: 'Peer not found' })
  if (!peer.isActive) {
    return { ok: true, alreadyRevoked: true }
  }

  const vps = (await db.select().from(vpsHosts).where(eq(vpsHosts.id, peer.vpsId)).limit(1))[0]
  if (!vps) throw createError({ statusCode: 404, statusMessage: 'VPS not found' })

  const target = await buildSshTarget(vps)
  const result = await runHelper<{ ok: boolean, error?: string }>(target, 'wg-peer-revoke', {
    name: peer.deviceName,
    publicKey: peer.publicKey,
    interface: vps.wgInterface || 'wg0'
  })

  if (!result.data?.ok) {
    await writeAudit({ action: 'peer.revoke', result: 'failure', vpsId: vps.id, peerId: id, detail: { error: result.data?.error } })
    throw createError({ statusCode: 502, statusMessage: result.data?.error || 'revoke failed' })
  }

  await db.update(peers).set({
    isActive: false,
    revokedAt: new Date().toISOString()
  }).where(eq(peers.id, id))

  await writeAudit({
    action: 'peer.revoke',
    result: 'success',
    vpsId: vps.id,
    peerId: id,
    detail: { deviceName: peer.deviceName, publicKey: peer.publicKey }
  })

  return { ok: true }
})
