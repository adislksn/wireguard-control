import { getDb } from '../db'
import { adminAuditLogs } from '../db/schema'

export async function writeAudit(opts: {
  action: string
  result: string
  vpsId?: number | null
  peerId?: number | null
  detail?: Record<string, unknown> | string | null
}) {
  const db = await getDb()
  const detail = typeof opts.detail === 'string'
    ? opts.detail
    : opts.detail
      ? JSON.stringify(sanitizeAuditDetail(opts.detail))
      : null

  await db.insert(adminAuditLogs).values({
    action: opts.action,
    result: opts.result,
    vpsId: opts.vpsId ?? null,
    peerId: opts.peerId ?? null,
    detail,
    timestamp: new Date().toISOString()
  })
}

function sanitizeAuditDetail(detail: Record<string, unknown>) {
  const clone: Record<string, unknown> = { ...detail }
  for (const key of Object.keys(clone)) {
    const lower = key.toLowerCase()
    if (lower.includes('private') || lower.includes('password') || lower.includes('preshared') || lower.includes('secret')) {
      clone[key] = '<REDACTED>'
    }
  }
  return clone
}
