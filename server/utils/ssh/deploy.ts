import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { execCommand, withSshConnection } from './client'
import type { SshTarget } from './types'

const HELPER_NAMES = [
  'wg-status',
  'vps-health',
  'wg-monitor-collect',
  'wg-init',
  'wg-purge',
  'wg-peer-add',
  'wg-peer-revoke',
  'wg-peer-config',
  'wg-peer-dns-sync',
  'dns-log-tail',
  'dns-setup'
]

function helpersDir() {
  return join(process.cwd(), 'scripts/vps/helpers')
}

function systemdDir() {
  return join(process.cwd(), 'scripts/vps/systemd')
}

/** Write a remote file via base64 over exec (works when SFTP is disabled). */
async function writeRemoteFile(
  exec: (cmd: string) => Promise<{ code: number, stdout: string, stderr: string }>,
  remotePath: string,
  content: Buffer | string,
  mode = '755'
) {
  const b64 = Buffer.from(content).toString('base64')
  // chunk to avoid huge command lines
  const chunkSize = 60000
  const chunks: string[] = []
  for (let i = 0; i < b64.length; i += chunkSize) {
    chunks.push(b64.slice(i, i + chunkSize))
  }
  await exec(`mkdir -p "$(dirname '${remotePath}')" && : > '${remotePath}.b64'`)
  for (const chunk of chunks) {
    const result = await exec(`printf '%s' '${chunk}' >> '${remotePath}.b64'`)
    if (result.code !== 0) {
      throw new Error(`Failed writing ${remotePath}: ${result.stderr}`)
    }
  }
  const decode = await exec(`base64 -d '${remotePath}.b64' > '${remotePath}' && rm -f '${remotePath}.b64' && chmod ${mode} '${remotePath}'`)
  if (decode.code !== 0) {
    throw new Error(`Failed decoding ${remotePath}: ${decode.stderr}`)
  }
}

export async function deployHelpers(target: SshTarget) {
  return withSshConnection(target, async (client, hostFingerprint) => {
    const exec = (cmd: string) => execCommand(client, cmd, 120_000)
    await exec('mkdir -p /usr/local/lib/wgcontrol /etc/systemd/system /var/lib/wg-monitor /var/log/wgcontrol /var/lib/wgcontrol')
    const dir = helpersDir()
    for (const name of HELPER_NAMES) {
      const content = await readFile(join(dir, name))
      await writeRemoteFile(exec, `/usr/local/lib/wgcontrol/${name}`, content, '755')
    }
    const service = await readFile(join(systemdDir(), 'wg-monitor.service'))
    const timer = await readFile(join(systemdDir(), 'wg-monitor.timer'))
    await writeRemoteFile(exec, '/etc/systemd/system/wg-monitor.service', service, '644')
    await writeRemoteFile(exec, '/etc/systemd/system/wg-monitor.timer', timer, '644')
    await exec('chmod 755 /usr/local/lib/wgcontrol/* && systemctl daemon-reload')
    return { ok: true, hostFingerprint, helpers: HELPER_NAMES }
  }, 180_000)
}

export async function installAuthorizedKey(target: SshTarget, publicKeyLine: string) {
  return withSshConnection(target, async (client, hostFingerprint) => {
    // eslint-disable-next-line no-useless-escape
    const escaped = publicKeyLine.trim().replace(/'/g, `'\"'\"'`)
    const script = `
set -e
mkdir -p /root/.ssh
chmod 700 /root/.ssh
touch /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys
grep -qxF '${escaped}' /root/.ssh/authorized_keys || echo '${escaped}' >> /root/.ssh/authorized_keys
`
    const result = await execCommand(client, script)
    return { ok: result.code === 0, hostFingerprint, stderr: result.stderr }
  })
}

export { HELPER_NAMES }
