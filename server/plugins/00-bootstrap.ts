import { ensureBootstrapAdmin } from '../utils/auth/session'
import { getDb } from '../db'
import { startCollectors } from '../utils/collectors'

export default defineNitroPlugin(async () => {
  await getDb()
  const boot = await ensureBootstrapAdmin()
  if (boot.created) {
    console.info(`[wgcontrol] bootstrap admin created: ${boot.username} (change password in settings)`)
  }
  // Delay collectors slightly so DB is ready
  setTimeout(() => {
    void startCollectors().catch(err => console.error('[wgcontrol] collectors failed to start', err))
  }, 2000)
})
