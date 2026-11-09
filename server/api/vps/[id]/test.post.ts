import { eq } from 'drizzle-orm'
import { getDb } from '../../../db'
import { vpsHosts } from '../../../db/schema'
import { writeAudit } from '../../../utils/audit'
import { testConnection } from '../../../utils/ssh/client'
import { buildSshTarget, publicVpsView } from '../../../utils/vps/target'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const db = await getDb()
  const vps = (await db.select().from(vpsHosts).where(eq(vpsHosts.id, id)).limit(1))[0]
  if (!vps) throw createError({ statusCode: 404, statusMessage: 'VPS not found' })

  try {
    const target = await buildSshTarget(vps)
    const result = await testConnection(target)
    await db.update(vpsHosts).set({
      hostFingerprint: result.hostFingerprint,
      status: result.ok ? 'reachable' : 'error',
      lastError: result.ok ? null : result.stderr || 'connection failed',
      updatedAt: new Date().toISOString()
    }).where(eq(vpsHosts.id, id))
    await writeAudit({ action: 'vps.test', result: result.ok ? 'success' : 'failure', vpsId: id })
    const refreshed = (await db.select().from(vpsHosts).where(eq(vpsHosts.id, id)))[0]!
    return { ok: result.ok, stdout: result.stdout, vps: publicVpsView(refreshed) }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    await db.update(vpsHosts).set({
      status: 'error',
      lastError: message,
      updatedAt: new Date().toISOString()
    }).where(eq(vpsHosts.id, id))
    await writeAudit({ action: 'vps.test', result: 'failure', vpsId: id, detail: { error: message } })
    throw createError({ statusCode: 502, statusMessage: message || 'SSH test failed' })
  }
})
