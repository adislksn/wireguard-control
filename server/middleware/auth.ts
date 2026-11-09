import { getSessionUser, sessionCookieName } from '../utils/auth/session'

const PUBLIC = new Set([
  '/api/auth/login',
  '/api/auth/status',
  '/api/auth/logout'
])

export default defineEventHandler(async (event) => {
  const path = getRequestURL(event).pathname
  if (!path.startsWith('/api/')) {
    return
  }
  if (PUBLIC.has(path)) {
    return
  }

  const sessionId = getCookie(event, sessionCookieName())
  const user = await getSessionUser(sessionId)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
  event.context.user = user
})
