export type SshAuth
  = | { type: 'key', privateKey: string, passphrase?: string }
    | { type: 'password', password: string }

export interface SshTarget {
  host: string
  port: number
  username: string
  auth: SshAuth
  hostFingerprint?: string | null
}

export interface SshExecResult {
  code: number
  stdout: string
  stderr: string
}

export interface HelperResponse<T = unknown> {
  ok: boolean
  data?: T
  error?: string
}
