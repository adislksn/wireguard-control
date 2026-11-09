import { eq } from 'drizzle-orm'
import { getDb } from '../../../db'
import { vpsHosts } from '../../../db/schema'
import { writeAudit } from '../../../utils/audit'
import { execCommand, runHelper, withSshConnection } from '../../../utils/ssh/client'
import { deployHelpers } from '../../../utils/ssh/deploy'
import { buildSshTarget, publicVpsView } from '../../../utils/vps/target'
import { initSchema } from '../../../utils/validation'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const body = initSchema.parse(await readBody(event) || {})
  const db = await getDb()
  const vps = (await db.select().from(vpsHosts).where(eq(vpsHosts.id, id)).limit(1))[0]
  if (!vps) throw createError({ statusCode: 404, statusMessage: 'VPS not found' })

  const target = await buildSshTarget(vps)
  await deployHelpers(target)

  const result = await runHelper<{ ok: boolean, data?: unknown, error?: string }>(target, 'wg-init', {
    interfaceName: body.interfaceName,
    listenPort: body.listenPort,
    wgSubnet: body.wgSubnet,
    serverVpnIp: body.serverVpnIp,
    upstreamDns: body.upstreamDns,
    enableIpv6: body.enableIpv6,
    force: body.force
  }, 300_000)

  if (!result.data?.ok) {
    await writeAudit({ action: 'vps.init', result: 'failure', vpsId: id, detail: { error: result.data?.error || result.stderr } })
    throw createError({ statusCode: 502, statusMessage: result.data?.error || result.stderr || 'init failed' })
  }

  const dns = await runHelper<{ ok: boolean, data?: unknown, error?: string }>(target, 'dns-setup', {
    interface: body.interfaceName,
    serverVpnIp: body.serverVpnIp,
    upstreamDns: body.upstreamDns
  })

  await withSshConnection(target, async (client) => {
    await execCommand(client, 'systemctl enable --now wg-monitor.timer')
  })

  await db.update(vpsHosts).set({
    wgInterface: body.interfaceName,
    wgSubnet: body.wgSubnet,
    serverVpnIp: body.serverVpnIp,
    listenPort: body.listenPort,
    status: 'ready',
    lastError: dns.data?.ok ? null : (dns.data?.error || 'dns setup warning'),
    updatedAt: new Date().toISOString()
  }).where(eq(vpsHosts.id, id))

  await writeAudit({
    action: 'vps.init',
    result: 'success',
    vpsId: id,
    detail: {
      publicKey: (result.data.data as { publicKey?: string }).publicKey,
      listenPort: body.listenPort,
      dnsOk: Boolean(dns.data?.ok)
    }
  })

  const refreshed = (await db.select().from(vpsHosts).where(eq(vpsHosts.id, id)))[0]!
  return {
    vps: publicVpsView(refreshed),
    init: result.data.data,
    dns: dns.data
  }
})
