import { eq } from 'drizzle-orm'
import { readFile } from 'node:fs/promises'
import { getDb } from '../../db'
import { vpsHosts } from '../../db/schema'
import { writeAudit } from '../../utils/audit'
import { testConnection } from '../../utils/ssh/client'
import { deployHelpers, installAuthorizedKey } from '../../utils/ssh/deploy'
import { ensureKeyPair, upsertSshConfigAlias } from '../../utils/ssh/keys'
import { publicVpsView } from '../../utils/vps/target'
import { vpsCreateSchema } from '../../utils/validation'

export default defineEventHandler(async (event) => {
  const body = vpsCreateSchema.parse(await readBody(event))
  const db = await getDb()

  const inserted = await db.insert(vpsHosts).values({
    name: body.name,
    host: body.host,
    sshPort: body.sshPort,
    sshUser: body.sshUser,
    authType: body.password ? 'password' : 'key',
    wgInterface: body.wgInterface,
    wgSubnet: body.wgSubnet,
    serverVpnIp: body.serverVpnIp,
    listenPort: body.listenPort,
    status: 'unknown',
    isActive: false
  }).returning()

  const vps = inserted[0]!
  const keys = await ensureKeyPair(vps.id)
  await db.update(vpsHosts).set({
    privateKeyPath: keys.privatePath,
    authType: 'key',
    updatedAt: new Date().toISOString()
  }).where(eq(vpsHosts.id, vps.id))

  await upsertSshConfigAlias(`wg-vps-${vps.id}`, {
    host: body.host,
    port: body.sshPort,
    user: body.sshUser,
    identityFile: keys.privatePath
  })
  await upsertSshConfigAlias('wg-vps', {
    host: body.host,
    port: body.sshPort,
    user: body.sshUser,
    identityFile: keys.privatePath
  })

  let fingerprint: string | null = null
  let bootstrapError: string | null = null

  if (body.password) {
    try {
      const passwordTarget = {
        host: body.host,
        port: body.sshPort,
        username: body.sshUser,
        auth: { type: 'password' as const, password: body.password }
      }
      const installed = await installAuthorizedKey(passwordTarget, keys.publicKey)
      fingerprint = installed.hostFingerprint
      const keyTarget = {
        host: body.host,
        port: body.sshPort,
        username: body.sshUser,
        auth: { type: 'key' as const, privateKey: await readFile(keys.privatePath, 'utf8') },
        hostFingerprint: fingerprint
      }
      const test = await testConnection(keyTarget)
      fingerprint = test.hostFingerprint
      await deployHelpers(keyTarget)
      await db.update(vpsHosts).set({
        hostFingerprint: fingerprint,
        status: 'reachable',
        lastError: null,
        updatedAt: new Date().toISOString()
      }).where(eq(vpsHosts.id, vps.id))
    } catch (err: unknown) {
      bootstrapError = (err as { message?: string }).message ?? String(err)
      await db.update(vpsHosts).set({
        status: 'error',
        lastError: bootstrapError,
        hostFingerprint: fingerprint,
        updatedAt: new Date().toISOString()
      }).where(eq(vpsHosts.id, vps.id))
    }
  }

  await writeAudit({
    action: 'vps.create',
    result: bootstrapError ? 'partial' : 'success',
    vpsId: vps.id,
    detail: { host: body.host, bootstrapError }
  })

  const refreshed = (await db.select().from(vpsHosts).where(eq(vpsHosts.id, vps.id)))[0]!
  return { vps: publicVpsView(refreshed), bootstrapError }
})
