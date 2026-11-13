import { and, eq } from 'drizzle-orm'
import { getDb } from '../../db'
import { peers, vpsHosts } from '../../db/schema'
import { execCommand, runHelper, withSshConnection } from '../ssh/client'
import { getSettings } from '../settings'
import { buildSshTarget } from '../vps/target'
import { parseQuietHours } from './status'

export async function syncPeerPolicies(vpsId: number) {
  const db = await getDb()
  const vps = (await db.select().from(vpsHosts).where(eq(vpsHosts.id, vpsId)).limit(1))[0]
  if (!vps?.privateKeyPath) {
    throw createError({ statusCode: 400, statusMessage: 'VPS SSH key missing' })
  }

  const settings = await getSettings()
  const rows = await db.select().from(peers)
    .where(and(eq(peers.vpsId, vpsId), eq(peers.isActive, true)))

  const policyPeers = rows.map((p) => {
    const quiet = parseQuietHours(p.quietHoursJson)
    return {
      deviceName: p.deviceName,
      publicKey: p.publicKey,
      manualPause: Boolean(p.paused && p.pausedReason === 'manual'),
      expiresAt: p.expiresAt,
      quietHoursEnabled: Boolean(p.quietHoursEnabled),
      quietHours: quiet
        ? { ...quiet, timezone: quiet.timezone || settings.timezone || 'UTC' }
        : null,
      dailyCapBytes: p.dailyCapBytes,
      quotaWarnPercent: p.quotaWarnPercent ?? 80
    }
  })

  const target = await buildSshTarget(vps)

  const sync = await runHelper<{ ok: boolean, data?: unknown, error?: string }>(target, 'wg-peer-policy-sync', {
    interface: vps.wgInterface || 'wg0',
    updatedAt: new Date().toISOString(),
    peers: policyPeers
  })

  if (!sync.data?.ok) {
    throw createError({
      statusCode: 502,
      statusMessage: sync.data?.error || sync.stderr || 'policy sync failed'
    })
  }

  await withSshConnection(target, async (client) => {
    await execCommand(client, 'systemctl enable --now wg-peer-policy.timer >/dev/null 2>&1 || true')
    await execCommand(client, '/usr/local/lib/wgcontrol/wg-peer-policy-enforce || true')
  })

  return { ok: true, peerCount: policyPeers.length, sync: sync.data.data }
}
