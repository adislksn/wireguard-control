export function useAuth() {
  const user = useState<{ username: string } | null>('auth-user', () => null)
  const checked = useState('auth-checked', () => false)

  async function refresh() {
    try {
      const data = await $fetch<{ authenticated: boolean, username: string | null }>('/api/auth/status')
      if (data?.authenticated && data.username) {
        user.value = { username: data.username }
      } else {
        user.value = null
      }
    } catch {
      user.value = null
    }
    checked.value = true
    return user.value
  }

  async function login(username: string, password: string) {
    await $fetch('/api/auth/login', { method: 'POST', body: { username, password } })
    await refresh()
  }

  async function logout() {
    await $fetch('/api/auth/logout', { method: 'POST' })
    user.value = null
  }

  return { user, checked, refresh, login, logout }
}
