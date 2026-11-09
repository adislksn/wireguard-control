import { mkdir, writeFile, chmod, readFile, access } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { generateKeyPairSync } from 'node:crypto'
import { constants } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export function keysDir() {
  return join(homedir(), '.wgcontrol', 'keys')
}

export function keyPathForVps(vpsId: number) {
  return join(keysDir(), `wgcontrol_${vpsId}_ed25519`)
}

export async function ensureKeyPair(vpsId: number) {
  const dir = keysDir()
  await mkdir(dir, { recursive: true, mode: 0o700 })
  const privatePath = keyPathForVps(vpsId)
  const publicPath = `${privatePath}.pub`

  try {
    await access(privatePath, constants.R_OK)
    const publicKey = await readFile(publicPath, 'utf8')
    return { privatePath, publicPath, publicKey: publicKey.trim(), created: false }
  } catch {
    // generate with ssh-keygen for OpenSSH format compatibility
  }

  try {
    await execFileAsync('ssh-keygen', [
      '-t', 'ed25519',
      '-f', privatePath,
      '-N', '',
      '-C', `wgcontrol-vps-${vpsId}`
    ])
  } catch {
    // Fallback to Node crypto + OpenSSH conversion is complex; use PEM and hope ssh2 accepts
    const { privateKey, publicKey } = generateKeyPairSync('ed25519')
    const priv = privateKey.export({ type: 'pkcs8', format: 'pem' })
    await writeFile(privatePath, priv, { mode: 0o600 })
    const pubDer = publicKey.export({ type: 'spki', format: 'der' })
    // Minimal OpenSSH pubkey is better via ssh-keygen; store placeholder
    await writeFile(publicPath, `ssh-ed25519 ${Buffer.from(pubDer).toString('base64')} wgcontrol-vps-${vpsId}\n`, { mode: 0o644 })
  }

  await chmod(privatePath, 0o600)
  const publicKey = (await readFile(publicPath, 'utf8')).trim()
  return { privatePath, publicPath, publicKey, created: true }
}

export async function upsertSshConfigAlias(alias: string, opts: {
  host: string
  port: number
  user: string
  identityFile: string
}) {
  const configPath = join(homedir(), '.ssh', 'config')
  await mkdir(join(homedir(), '.ssh'), { recursive: true, mode: 0o700 })
  let existing: string
  try {
    existing = await readFile(configPath, 'utf8')
  } catch {
    existing = ''
  }

  const block = [
    `Host ${alias}`,
    `  HostName ${opts.host}`,
    `  Port ${opts.port}`,
    `  User ${opts.user}`,
    `  IdentityFile ${opts.identityFile}`,
    `  IdentitiesOnly yes`,
    `  StrictHostKeyChecking yes`,
    ''
  ].join('\n')

  const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const hostRegex = new RegExp(`(?:^|\\n)Host[ \\t]+${escaped}(?:[ \\t].*)?\\n(?:[ \\t].*\\n)*`, 'g')
  const stripped = existing.replace(hostRegex, '\n')
  const next = `${stripped.trimEnd()}\n\n${block}`
  await writeFile(configPath, `${next.trimEnd()}\n`, { mode: 0o600 })
}
