import { getSessionUser, sessionCookieName } from '../../utils/auth/session'

export default defineEventHandler(async (event) => {
  const user = await getSessionUser(getCookie(event, sessionCookieName()))
  return {
    authenticated: Boolean(user),
    username: user?.username || null
  }
})
