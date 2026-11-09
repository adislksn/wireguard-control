import { eq } from 'drizzle-orm'
import { getDb } from '../../db'
import { adminUsers } from '../../db/schema'
import { verifyPassword } from '../../utils/auth/password'
import { createSession, sessionCookieName } from '../../utils/auth/session'
import { writeAudit } from '../../utils/audit'
import { loginSchema } from '../../utils/validation'

const attempts = new Map<string, { count: number, resetAt: number }>()

export default defineEventHandler(async (event) => {
  const ip = getRequestIP(event, { xForwardedFor: false }) || 'local'
  const now = Date.now()
  const bucket = attempts.get(ip) || { count: 0, resetAt: now + 15 * 60_000 }
  if (now > bucket.resetAt) {
    bucket.count = 0
    bucket.resetAt = now + 15 * 60_000
  }
  if (bucket.count >= 10) {
    throw createError({ statusCode: 429, statusMessage: 'Too many login attempts' })
  }

  const body = loginSchema.parse(await readBody(event))
  const db = await getDb()
  const users = await db.select().from(adminUsers).where(eq(adminUsers.username, body.username)).limit(1)
  const user = users[0]
  if (!user || !(await verifyPassword(body.password, user.passwordHash))) {
    bucket.count += 1
    attempts.set(ip, bucket)
    await writeAudit({ action: 'auth.login', result: 'failure', detail: { username: body.username } })
    throw createError({ statusCode: 401, statusMessage: 'Invalid credentials' })
  }

  attempts.delete(ip)
  const session = await createSession(user.id)
  setCookie(event, sessionCookieName(), session.id, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: session.expiresAt
  })
  await writeAudit({ action: 'auth.login', result: 'success', detail: { username: user.username } })
  return { ok: true, username: user.username }
})
