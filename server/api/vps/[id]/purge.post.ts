import { eq } from 'drizzle-orm'
import { getDb } from '../../../db'
import { vpsHosts } from '../../../db/schema'
import { writeAudit } from '../../../utils/audit'
import { runHelper } from '../../../utils/ssh/client'
import { buildSshTarget, publicVpsView } from '../../../utils/vps/target'
import { purgeSchema } from '../../../utils/validation'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const body = purgeSchema.parse(await readBody(event))
  const db = await getDb()
  const vps = (await db.select().from(vpsHosts).where(eq(vpsHosts.id, id)).limit(1))[0]
  if (!vps) throw createError({ statusCode: 404, statusMessage: 'VPS not found' })

  const target = await buildSshTarget(vps)
  const result = await runHelper<{ ok: boolean, data?: unknown, error?: string }>(target, 'wg-purge', {
    confirm: body.confirm,
    interfaceName: vps.wgInterface || 'wg0',
    listenPort: vps.listenPort || 51820
  })

  if (!result.data?.ok) {
    await writeAudit({ action: 'vps.purge', result: 'failure', vpsId: id, detail: { error: result.data?.error } })
    throw createError({ statusCode: 502, statusMessage: result.data?.error || 'purge failed' })
  }

  await db.update(vpsHosts).set({
    status: 'no_wireguard',
    lastError: null,
    updatedAt: new Date().toISOString()
  }).where(eq(vpsHosts.id, id))

  const purge = (result.data.data ?? null) as Record<string, unknown> | null
  await writeAudit({ action: 'vps.purge', result: 'success', vpsId: id, detail: purge })
  const refreshed = (await db.select().from(vpsHosts).where(eq(vpsHosts.id, id)))[0]!
  return { vps: publicVpsView(refreshed), purge }
})
