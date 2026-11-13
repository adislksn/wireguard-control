import { and, eq, lt } from 'drizzle-orm'
import { getDb } from '../../db'
import { collectorCursors, dnsQueries, peerSnapshots, peers, vpsHosts } from '../../db/schema'
import { parseDnsLogLines } from '../dns/parse'
import { getSettings } from '../settings'
import { runHelper } from '../ssh/client'
import { buildSshTarget, getActiveVps } from '../vps/target'

let timers: NodeJS.Timeout[] = []
let running = false

export function stopCollectors() {
  for (const t of timers) clearInterval(t)
  timers = []
  running = false
}

export async function startCollectors() {
  stopCollectors()
  running = true
  const settings = await getSettings()

  const peerTimer = setInterval(() => {
    void collectPeerStats().catch(err => console.error('[collector:peers]', err?.message || err))
  }, settings.peerStatsIntervalSec * 1000)

  const dnsTimer = setInterval(() => {
    void collectDnsLogs().catch(err => console.error('[collector:dns]', err?.message || err))
  }, settings.dnsCollectIntervalSec * 1000)

  const healthTimer = setInterval(() => {
    void collectHealth().catch(err => console.error('[collector:health]', err?.message || err))
  }, settings.healthIntervalSec * 1000)

  const retentionTimer = setInterval(() => {
    void runRetention().catch(err => console.error('[collector:retention]', err?.message || err))
  }, 60 * 60 * 1000)

  timers = [peerTimer, dnsTimer, healthTimer, retentionTimer]

  // kick once
  void collectPeerStats().catch(() => {})
  void collectDnsLogs().catch(() => {})
  void collectHealth().catch(() => {})
}

async function withActiveTarget() {
  const vps = await getActiveVps()
  if (!vps || !vps.privateKeyPath) return null
  try {
    const target = await buildSshTarget(vps)
    return { vps, target }
  } catch {
    return null
  }
}

export async function collectPeerStats() {
  const ctx = await withActiveTarget()
  if (!ctx) return
  const { vps, target } = ctx
  const result = await runHelper<{ ok: boolean, data?: { timestamp: string, peerCount: number }, error?: string }>(
    target,
    'wg-monitor-collect',
    { interface: vps.wgInterface || 'wg0' }
  )
  if (!result.data?.ok) {
    await updateVpsStatus(vps.id, 'error', result.data?.error || result.stderr || 'monitor failed')
    return
  }

  const status = await runHelper<{
    ok: boolean
    data?: {
      active: boolean
      peers: Array<{
        publicKey: string
        allowedIps: string
        latestHandshake: number
        rxBytes: number
        txBytes: number
        endpoint: string
      }>
    }
  }>(target, 'wg-status', { interface: vps.wgInterface || 'wg0' })

  if (!status.data?.ok || !status.data.data) return
  const db = await getDb()
  const ts = new Date().toISOString()
  const existing = await db.select().from(peers).where(and(eq(peers.vpsId, vps.id), eq(peers.isActive, true)))
  const byKey = new Map(existing.map(p => [p.publicKey, p]))

  for (const peer of status.data.data.peers) {
    const local = byKey.get(peer.publicKey)
    await db.insert(peerSnapshots).values({
      vpsId: vps.id,
      peerId: local?.id ?? null,
      publicKey: peer.publicKey,
      timestamp: ts,
      rxBytes: peer.rxBytes,
      txBytes: peer.txBytes,
      latestHandshake: peer.latestHandshake
        ? new Date(peer.latestHandshake * 1000).toISOString()
        : null,
      endpoint: peer.endpoint || null,
      allowedIps: peer.allowedIps || null
    })
  }

  // Ingest VPS quota/pause status (written by peer-policy-enforce)
  const quota = await runHelper<{
    ok: boolean
    data?: {
      updatedAt?: string
      peers?: Record<string, {
        usedBytes?: number
        warnReached?: boolean
        effectiveReason?: string | null
        paused?: boolean
        manualPause?: boolean
      }>
    }
  }>(target, 'wg-peer-quota-status', {})

  if (quota.data?.ok && quota.data.data) {
    const payload = JSON.stringify(quota.data.data)
    const existingQuota = await db.select().from(collectorCursors)
      .where(and(eq(collectorCursors.vpsId, vps.id), eq(collectorCursors.kind, 'quota')))
      .limit(1)
    if (existingQuota[0]) {
      await db.update(collectorCursors).set({
        cursor: payload,
        updatedAt: new Date().toISOString()
      }).where(eq(collectorCursors.id, existingQuota[0].id))
    } else {
      await db.insert(collectorCursors).values({
        vpsId: vps.id,
        kind: 'quota',
        cursor: payload
      })
    }

    // Reflect auto-pause reasons into local DB (do not override manual with null)
    const remotePeers = quota.data.data.peers || {}
    for (const local of existing) {
      const remote = remotePeers[local.publicKey]
      if (!remote) continue
      const autoReason = remote.effectiveReason === 'quiet_hours'
        || remote.effectiveReason === 'expired'
        || remote.effectiveReason === 'quota'
        ? remote.effectiveReason
        : null
      const reason = remote.manualPause ? 'manual' : autoReason
      const shouldPause = Boolean(remote.paused)
      if (local.paused === shouldPause && local.pausedReason === reason) continue
      // Keep manual pause sticky if remote still reports manual
      if (local.pausedReason === 'manual' && !remote.manualPause && shouldPause) continue
      await db.update(peers).set({
        paused: shouldPause,
        pausedReason: shouldPause ? reason : null
      }).where(eq(peers.id, local.id))
    }
  }

  await updateVpsStatus(vps.id, status.data.data.active ? 'ready' : 'no_wireguard', null)
}

export async function collectDnsLogs() {
  const ctx = await withActiveTarget()
  if (!ctx) return
  const { vps, target } = ctx
  const db = await getDb()
  const cursorRows = await db.select().from(collectorCursors)
    .where(and(eq(collectorCursors.vpsId, vps.id), eq(collectorCursors.kind, 'dns')))
    .limit(1)
  let cursor = 0
  let inode: number | null = null
  if (cursorRows[0]) {
    try {
      const parsed = JSON.parse(cursorRows[0].cursor)
      cursor = Number(parsed.cursor || 0)
      inode = parsed.inode ?? null
    } catch {
      cursor = 0
    }
  }

  const result = await runHelper<{
    ok: boolean
    data?: { lines: string[], cursor: number, inode: number | null, rotated: boolean }
    error?: string
  }>(target, 'dns-log-tail', { cursor, inode })

  if (!result.data?.ok || !result.data.data) return
  const records = parseDnsLogLines(result.data.data.lines)
  if (!records.length) {
    // still advance cursor so startup/noise lines are not re-read forever
  } else {
    const peerRows = await db.select().from(peers).where(eq(peers.vpsId, vps.id))
    const byIp = new Map<string, typeof peerRows[number]>()
    for (const p of peerRows) {
      if (!p.isActive) continue
      byIp.set(p.vpnIp.split('/')[0]!, p)
    }

    for (const rec of records) {
      // Ignore queries sourced from the VPN server itself (health/dig checks)
      if (rec.clientIp === (vps.serverVpnIp || '10.7.0.1')) continue
      const peer = byIp.get(rec.clientIp)
      await db.insert(dnsQueries).values({
        vpsId: vps.id,
        peerId: peer?.id ?? null,
        timestamp: rec.timestamp,
        clientIp: rec.clientIp,
        domain: rec.domain,
        recordType: rec.recordType
      })
    }
  }

  const nextCursor = JSON.stringify({
    cursor: result.data.data.cursor,
    inode: result.data.data.inode
  })
  if (cursorRows[0]) {
    await db.update(collectorCursors)
      .set({ cursor: nextCursor, updatedAt: new Date().toISOString() })
      .where(eq(collectorCursors.id, cursorRows[0].id))
  } else {
    await db.insert(collectorCursors).values({
      vpsId: vps.id,
      kind: 'dns',
      cursor: nextCursor
    })
  }
}

export async function collectHealth() {
  const ctx = await withActiveTarget()
  if (!ctx) return
  const { vps, target } = ctx
  const result = await runHelper<{ ok: boolean, data?: unknown, error?: string }>(target, 'vps-health', {})
  const db = await getDb()
  if (!result.data?.ok) {
    await db.update(vpsHosts).set({
      status: 'error',
      lastError: result.data?.error || result.stderr || 'health failed',
      updatedAt: new Date().toISOString()
    }).where(eq(vpsHosts.id, vps.id))
    return
  }
  const existingHealth = await db.select().from(collectorCursors)
    .where(and(eq(collectorCursors.vpsId, vps.id), eq(collectorCursors.kind, 'health')))
    .limit(1)
  const healthCursor = JSON.stringify(result.data.data)
  if (existingHealth[0]) {
    await db.update(collectorCursors).set({
      cursor: healthCursor,
      updatedAt: new Date().toISOString()
    }).where(eq(collectorCursors.id, existingHealth[0].id))
  } else {
    await db.insert(collectorCursors).values({
      vpsId: vps.id,
      kind: 'health',
      cursor: healthCursor
    })
  }
  await updateVpsStatus(vps.id, 'reachable', null)
}

async function updateVpsStatus(id: number, status: typeof vpsHosts.$inferSelect.status, lastError: string | null) {
  const db = await getDb()
  await db.update(vpsHosts).set({
    status,
    lastError,
    updatedAt: new Date().toISOString()
  }).where(eq(vpsHosts.id, id))
}

export async function runRetention() {
  const settings = await getSettings()
  const db = await getDb()
  const dnsCutoff = new Date(Date.now() - settings.dnsRetentionDays * 86400000).toISOString()
  const statsCutoff = new Date(Date.now() - settings.peerStatsRetentionDays * 86400000).toISOString()
  await db.delete(dnsQueries).where(lt(dnsQueries.timestamp, dnsCutoff))
  await db.delete(peerSnapshots).where(lt(peerSnapshots.timestamp, statsCutoff))
}

export function collectorsRunning() {
  return running
}
