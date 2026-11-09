import { eq } from 'drizzle-orm'
import { getDb } from '../../db'
import { vpsHosts } from '../../db/schema'
import { writeAudit } from '../../utils/audit'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  const db = await getDb()
  const vps = (await db.select().from(vpsHosts).where(eq(vpsHosts.id, id)).limit(1))[0]
  if (!vps) throw createError({ statusCode: 404, statusMessage: 'VPS not found' })
  await db.delete(vpsHosts).where(eq(vpsHosts.id, id))
  await writeAudit({ action: 'vps.delete', result: 'success', vpsId: id, detail: { host: vps.host } })
  return { ok: true }
})
