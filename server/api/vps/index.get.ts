import { getDb } from '../../db'
import { vpsHosts } from '../../db/schema'
import { publicVpsView } from '../../utils/vps/target'

export default defineEventHandler(async () => {
  const db = await getDb()
  const rows = await db.select().from(vpsHosts)
  return rows.map(publicVpsView)
})
