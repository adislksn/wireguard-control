import { eq } from 'drizzle-orm'
import { getDb } from '../../db'
import { peers } from '../../db/schema'
import { writeAudit } from '../../utils/audit'
import { getSettings } from '../../utils/settings'
import { runHelper } from '../../utils/ssh/client'
import { buildSshTarget, getActiveVps } from '../../utils/vps/target'
import { peerCreateSchema } from '../../utils/validation'

export default defineEventHandler(async (event) => {
  const body = peerCreateSchema.parse(await readBody(event))
  const vps = await getActiveVps()
  if (!vps) throw createError({ statusCode: 400, statusMessage: 'No active VPS' })
  if (vps.status !== 'ready' && vps.status !== 'reachable') {
    // allow if WG ready preferred
  }

  const settings = await getSettings()
  const clientDns = settings.clientDns || vps.serverVpnIp || '10.7.0.1'

  const target = await buildSshTarget(vps)
  const result = await runHelper<{
    ok: boolean
    data?: {
      name: string
      publicKey: string
      vpnIp: string
      clientConfig: string
    }
    error?: string
  }>(target, 'wg-peer-add', {
    name: body.deviceName,
    interface: vps.wgInterface || 'wg0',
    wgSubnet: vps.wgSubnet || '10.7.0.0/24',
    serverVpnIp: vps.serverVpnIp || '10.7.0.1',
    listenPort: vps.listenPort || 51820,
    dns: clientDns
  })

  if (!result.data?.ok || !result.data.data) {
    await writeAudit({ action: 'peer.add', result: 'failure', vpsId: vps.id, detail: { error: result.data?.error } })
    throw createError({ statusCode: 502, statusMessage: result.data?.error || 'peer add failed' })
  }

  const data = result.data.data
  const db = await getDb()
  const inserted = await db.insert(peers).values({
    vpsId: vps.id,
    publicKey: data.publicKey,
    deviceName: body.deviceName,
    deviceType: body.deviceType,
    description: body.description || null,
    vpnIp: data.vpnIp,
    isActive: true
  }).returning()

  await writeAudit({
    action: 'peer.add',
    result: 'success',
    vpsId: vps.id,
    peerId: inserted[0]!.id,
    detail: { deviceName: body.deviceName, vpnIp: data.vpnIp, publicKey: data.publicKey }
  })

  // clientConfig returned once — not stored
  return {
    peer: inserted[0],
    clientConfig: data.clientConfig,
    vpnIp: data.vpnIp
  }
})
