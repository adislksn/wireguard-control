import { and, eq, gt } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import { getDb } from '../../db'
import { adminUsers, sessions } from '../../db/schema'

const SESSION_COOKIE = 'wgcontrol_session'
const SESSION_DAYS = 7

export function sessionCookieName() {
  return SESSION_COOKIE
}

export async function createSession(userId: number) {
  const db = await getDb()
  const id = randomBytes(32).toString('hex')
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000)
  await db.insert(sessions).values({
    id,
    userId,
    expiresAt: expires.toISOString()
  })
  return { id, expiresAt: expires }
}

export async function destroySession(sessionId: string) {
  const db = await getDb()
  await db.delete(sessions).where(eq(sessions.id, sessionId))
}

export async function getSessionUser(sessionId?: string | null) {
  if (!sessionId) {
    return null
  }
  const db = await getDb()
  const now = new Date().toISOString()
  const rows = await db
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      userId: adminUsers.id,
      username: adminUsers.username
    })
    .from(sessions)
    .innerJoin(adminUsers, eq(sessions.userId, adminUsers.id))
    .where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, now)))
    .limit(1)

  return rows[0] || null
}

export async function requireUser(event: Parameters<typeof getCookie>[0]) {
  const sessionId = getCookie(event, SESSION_COOKIE)
  const user = await getSessionUser(sessionId)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  return user
}

export async function ensureBootstrapAdmin() {
  const db = await getDb()
  const existing = await db.select({ id: adminUsers.id }).from(adminUsers).limit(1)
  if (existing.length) {
    return { created: false as const }
  }

  const config = useRuntimeConfig()
  const username = config.adminUsername || 'admin'
  const password = config.adminPassword || 'changeme'
  const { hashPassword } = await import('./password')
  const passwordHash = await hashPassword(password)
  await db.insert(adminUsers).values({ username, passwordHash })
  return { created: true as const, username }
}
