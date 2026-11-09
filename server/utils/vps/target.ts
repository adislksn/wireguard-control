import { eq } from 'drizzle-orm'
import { readFile } from 'node:fs/promises'
import { getDb } from '../../db'
import { vpsHosts } from '../../db/schema'
import type { SshTarget } from '../ssh/types'

export async function getVpsById(id: number) {
  const db = await getDb()
  const rows = await db.select().from(vpsHosts).where(eq(vpsHosts.id, id)).limit(1)
  return rows[0] || null
}

export async function getActiveVps() {
  const db = await getDb()
  const rows = await db.select().from(vpsHosts).where(eq(vpsHosts.isActive, true)).limit(1)
  return rows[0] || null
}

export async function buildSshTarget(vps: typeof vpsHosts.$inferSelect, password?: string): Promise<SshTarget> {
  if (password) {
    return {
      host: vps.host,
      port: vps.sshPort,
      username: vps.sshUser,
      auth: { type: 'password', password },
      hostFingerprint: vps.hostFingerprint
    }
  }

  if (!vps.privateKeyPath) {
    throw createError({ statusCode: 400, statusMessage: 'VPS has no SSH private key configured' })
  }

  const privateKey = await readFile(vps.privateKeyPath, 'utf8')
  return {
    host: vps.host,
    port: vps.sshPort,
    username: vps.sshUser,
    auth: { type: 'key', privateKey },
    hostFingerprint: vps.hostFingerprint
  }
}

export function publicVpsView(vps: typeof vpsHosts.$inferSelect) {
  return {
    id: vps.id,
    name: vps.name,
    host: vps.host,
    sshPort: vps.sshPort,
    sshUser: vps.sshUser,
    authType: vps.authType,
    hasPrivateKey: Boolean(vps.privateKeyPath),
    hostFingerprint: vps.hostFingerprint,
    wgInterface: vps.wgInterface,
    wgSubnet: vps.wgSubnet,
    serverVpnIp: vps.serverVpnIp,
    listenPort: vps.listenPort,
    status: vps.status,
    lastError: vps.lastError,
    isActive: vps.isActive,
    createdAt: vps.createdAt,
    updatedAt: vps.updatedAt
  }
}
