import { destroySession, sessionCookieName } from '../../utils/auth/session'

export default defineEventHandler(async (event) => {
  const id = getCookie(event, sessionCookieName())
  if (id) {
    await destroySession(id)
  }
  deleteCookie(event, sessionCookieName(), { path: '/' })
  return { ok: true }
})
