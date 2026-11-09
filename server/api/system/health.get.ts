import { collectorsRunning } from '../../utils/collectors'
import { getActiveVps, publicVpsView } from '../../utils/vps/target'

export default defineEventHandler(async () => {
  const vps = await getActiveVps()
  return {
    ok: true,
    collectorsRunning: collectorsRunning(),
    bindHint: '127.0.0.1',
    activeVps: vps ? publicVpsView(vps) : null,
    now: new Date().toISOString()
  }
})
