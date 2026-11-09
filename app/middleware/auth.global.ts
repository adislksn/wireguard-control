export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path === '/login') {
    return
  }
  const { user, checked, refresh } = useAuth()
  if (!checked.value) {
    await refresh()
  }
  if (!user.value) {
    return navigateTo('/login')
  }
})
