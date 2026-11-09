import { createSharedComposable } from '@vueuse/core'

const _useDashboard = () => {
  const router = useRouter()

  defineShortcuts({
    'g-h': () => router.push('/'),
    'g-p': () => router.push('/peers'),
    'g-d': () => router.push('/domains'),
    'g-a': () => router.push('/analytics'),
    'g-s': () => router.push('/settings')
  })

  return {}
}

export const useDashboard = createSharedComposable(_useDashboard)
