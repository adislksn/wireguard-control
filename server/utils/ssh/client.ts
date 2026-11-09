import { Client, type ConnectConfig } from 'ssh2'
import { readFile } from 'node:fs/promises'
import { fingerprintsMatch } from './fingerprint'
import type { SshExecResult, SshTarget } from './types'

const DEFAULT_TIMEOUT_MS = 30_000

export async function withSshConnection<T>(
  target: SshTarget,
  fn: (client: Client, hostFingerprint: string) => Promise<T>,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<T> {
  const client = new Client()
  let settledFingerprint = ''

  const config: ConnectConfig = {
    host: target.host,
    port: target.port,
    username: target.username,
    readyTimeout: timeoutMs,
    tryKeyboard: false,
    hostHash: 'sha256',
    hostVerifier: (hashedKey: string) => {
      const fp = `SHA256:${hashedKey}`
      settledFingerprint = fp
      if (target.hostFingerprint && !fingerprintsMatch(target.hostFingerprint, fp)) {
        return false
      }
      return true
    }
  }

  if (target.auth.type === 'password') {
    config.password = target.auth.password
  } else {
    config.privateKey = target.auth.privateKey
    if (target.auth.passphrase) {
      config.passphrase = target.auth.passphrase
    }
  }

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      client.end()
      reject(new Error(`SSH connection timed out to ${target.host}:${target.port}`))
    }, timeoutMs)

    client
      .on('ready', () => {
        clearTimeout(timer)
        resolve()
      })
      .on('error', (err) => {
        clearTimeout(timer)
        reject(err)
      })
      .connect(config)
  })

  try {
    return await fn(client, settledFingerprint)
  } finally {
    client.end()
  }
}

export function execCommand(client: Client, command: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<SshExecResult> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`SSH command timed out: ${command.slice(0, 80)}`))
    }, timeoutMs)

    client.exec(command, (err, stream) => {
      if (err) {
        clearTimeout(timer)
        reject(err)
        return
      }
      let stdout = ''
      let stderr = ''
      stream
        .on('close', (code: number) => {
          clearTimeout(timer)
          resolve({ code: code ?? 0, stdout, stderr })
        })
        .on('data', (data: Buffer) => {
          stdout += data.toString('utf8')
        })
      stream.stderr.on('data', (data: Buffer) => {
        stderr += data.toString('utf8')
      })
    })
  })
}

export async function loadPrivateKey(path: string) {
  return readFile(path, 'utf8')
}

export async function testConnection(target: SshTarget) {
  return withSshConnection(target, async (client, hostFingerprint) => {
    const result = await execCommand(client, 'echo ok && uname -s && cat /etc/os-release | head -5')
    return {
      ok: result.code === 0 && result.stdout.includes('ok'),
      hostFingerprint,
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim(),
      code: result.code
    }
  })
}

export async function runRemoteJson<T = unknown>(
  target: SshTarget,
  helperPath: string,
  payload?: unknown
) {
  return withSshConnection(target, async (client, hostFingerprint) => {
    const input = payload === undefined ? '' : JSON.stringify(payload)
    // Pass JSON on stdin to avoid shell injection
    const command = `python3 - <<'PY'
import json,subprocess,sys
payload=sys.stdin.read()
cmd=[${JSON.stringify(helperPath)}]
proc=subprocess.run(cmd,input=payload.encode(),stdout=subprocess.PIPE,stderr=subprocess.PIPE)
sys.stdout.buffer.write(proc.stdout)
sys.stderr.buffer.write(proc.stderr)
sys.exit(proc.returncode)
PY`
    const result = await new Promise<SshExecResult>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('helper timed out')), DEFAULT_TIMEOUT_MS)
      client.exec(command, (err, stream) => {
        if (err) {
          clearTimeout(timer)
          reject(err)
          return
        }
        let stdout = ''
        let stderr = ''
        if (input) {
          stream.write(input)
        }
        stream.end()
        stream
          .on('close', (code: number) => {
            clearTimeout(timer)
            resolve({ code: code ?? 0, stdout, stderr })
          })
          .on('data', (data: Buffer) => {
            stdout += data.toString('utf8')
          })
        stream.stderr.on('data', (data: Buffer) => {
          stderr += data.toString('utf8')
        })
      })
    })

    let parsed: T | null = null
    const text = result.stdout.trim()
    if (text) {
      try {
        parsed = JSON.parse(text) as T
      } catch {
        parsed = null
      }
    }

    return {
      hostFingerprint,
      code: result.code,
      stdout: result.stdout,
      stderr: redactSecrets(result.stderr),
      data: parsed
    }
  })
}

export function redactSecrets(value: string) {
  return value
    .replace(/(PrivateKey|PresharedKey)\s*=\s*.+/gi, '$1 = <REDACTED>')
    .replace(/BEGIN (OPENSSH |EC |RSA )?PRIVATE KEY[\s\S]*?END (OPENSSH |EC |RSA )?PRIVATE KEY/g, '<REDACTED_PRIVATE_KEY>')
}

/** Simpler helper invocation: helper reads argv JSON file via stdin only. */
export async function runHelper<T = unknown>(
  target: SshTarget,
  helperName: string,
  payload?: Record<string, unknown>,
  timeoutMs = DEFAULT_TIMEOUT_MS
) {
  const helperPath = `/usr/local/lib/wgcontrol/${helperName}`
  return withSshConnection(target, async (client, hostFingerprint) => {
    const b64 = Buffer.from(JSON.stringify(payload || {}), 'utf8').toString('base64')
    // base64 payload avoids shell metacharacter issues; helper decodes JSON
    const command = `echo '${b64}' | base64 -d | ${helperPath}`
    const result = await execCommand(client, command, timeoutMs)
    let data: T | null = null
    try {
      data = JSON.parse(result.stdout.trim()) as T
    } catch {
      data = null
    }
    return {
      hostFingerprint,
      code: result.code,
      stderr: redactSecrets(result.stderr),
      raw: redactSecrets(result.stdout),
      data
    }
  }, Math.max(timeoutMs + 5_000, DEFAULT_TIMEOUT_MS))
}
