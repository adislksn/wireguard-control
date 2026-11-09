import { writeAudit } from '../../utils/audit'
import { startCollectors } from '../../utils/collectors'
import { patchSettings } from '../../utils/settings'
import { runHelper } from '../../utils/ssh/client'
import { settingsSchema } from '../../utils/validation'
import { buildSshTarget, getActiveVps } from '../../utils/vps/target'

export default defineEventHandler(async (event) => {
  const body = settingsSchema.parse(await readBody(event))
  const settings = await patchSettings(body)
  await startCollectors()

  let peerDnsSync: { updatedCount?: number, error?: string } | null = null
  if (body.clientDns) {
    try {
      const vps = await getActiveVps()
      if (vps?.privateKeyPath) {
        const target = await buildSshTarget(vps)
        const result = await runHelper<{ ok: boolean, data?: { updatedCount: number }, error?: string }>(
          target,
          'wg-peer-dns-sync',
          { dns: settings.clientDns }
        )
        if (result.data?.ok) {
          peerDnsSync = { updatedCount: result.data.data?.updatedCount ?? 0 }
        } else {
          peerDnsSync = { error: result.data?.error || result.stderr || 'dns sync failed' }
        }
      }
    } catch (err: any) {
      peerDnsSync = { error: err?.message || 'dns sync failed' }
    }
  }

  await writeAudit({
    action: 'settings.update',
    result: 'success',
    detail: { ...body, peerDnsSync }
  })
  return { ...settings, peerDnsSync }
})
