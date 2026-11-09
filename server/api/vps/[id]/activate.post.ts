import { eq } from 'drizzle-orm'
import { getDb } from '../../../db'
import { vpsHosts } from '../../../db/schema'
import { writeAudit } from '../../../utils/audit'
import { startCollectors } from '../../../utils/collectors'
import { upsertSshConfigAlias } from '../../../utils/ssh/keys'
import { publicVpsView } from '../../../utils/vps/target'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id'))
  if (!id) throw createError({ statusCode: 400, statusMessage: 'Invalid id' })
  const db = await getDb()
  const rows = await db.select().from(vpsHosts).where(eq(vpsHosts.id, id)).limit(1)
  const vps = rows[0]
  if (!vps) throw createError({ statusCode: 404, statusMessage: 'VPS not found' })

  await db.update(vpsHosts).set({ isActive: false })
  await db.update(vpsHosts).set({
    isActive: true,
    updatedAt: new Date().toISOString()
  }).where(eq(vpsHosts.id, id))

  if (vps.privateKeyPath) {
    await upsertSshConfigAlias('wg-vps', {
      host: vps.host,
      port: vps.sshPort,
      user: vps.sshUser,
      identityFile: vps.privateKeyPath
    })
  }

  await startCollectors()
  await writeAudit({ action: 'vps.activate', result: 'success', vpsId: id })
  const refreshed = (await db.select().from(vpsHosts).where(eq(vpsHosts.id, id)))[0]!
  return publicVpsView(refreshed)
})
