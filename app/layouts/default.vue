<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'
import type { VpsHost } from '~/types'

const open = ref(false)
const { user, logout } = useAuth()
const toast = useToast()

const { data: vpsList, refresh: refreshVps } = await useFetch<VpsHost[]>('/api/vps', {
  default: () => [],
  lazy: true,
  server: false
})

const activeVpsId = computed({
  get: () => vpsList.value?.find(v => v.isActive)?.id ?? undefined,
  set: (id: number | undefined) => {
    if (id) void activateVps(id)
  }
})

const vpsItems = computed(() =>
  (vpsList.value || []).map(v => ({
    label: `${v.name} (${v.host})`,
    value: v.id
  }))
)

const links = computed(() => [[{
  label: 'Overview',
  icon: 'i-lucide-layout-dashboard',
  to: '/',
  onSelect: () => { open.value = false }
}, {
  label: 'Peers',
  icon: 'i-lucide-smartphone',
  to: '/peers',
  onSelect: () => { open.value = false }
}, {
  label: 'Domains',
  icon: 'i-lucide-globe',
  to: '/domains',
  onSelect: () => { open.value = false }
}, {
  label: 'Analytics',
  icon: 'i-lucide-chart-area',
  to: '/analytics',
  onSelect: () => { open.value = false }
}, {
  label: 'Settings',
  icon: 'i-lucide-settings',
  to: '/settings',
  onSelect: () => { open.value = false }
}]] satisfies NavigationMenuItem[][])

async function activateVps(id: number) {
  try {
    await $fetch(`/api/vps/${id}/activate`, { method: 'POST' })
    await refreshVps()
    toast.add({ title: 'Active VPS switched', color: 'success' })
  } catch (e: any) {
    toast.add({ title: 'Switch failed', description: e?.data?.statusMessage || e?.message, color: 'error' })
  }
}

async function onLogout() {
  await logout()
  await navigateTo('/login')
}
</script>

<template>
  <UDashboardGroup unit="rem">
    <UDashboardSidebar
      id="default"
      v-model:open="open"
      collapsible
      resizable
      class="bg-elevated/25"
      :ui="{ footer: 'lg:border-t lg:border-default' }"
    >
      <template #header="{ collapsed }">
        <div class="flex items-center gap-2 px-2 py-1">
          <UIcon name="i-lucide-shield" class="size-5 text-primary" />
          <span v-if="!collapsed" class="font-semibold tracking-tight">wgcontrol</span>
        </div>
      </template>

      <template #default="{ collapsed }">
        <div v-if="!collapsed" class="px-2 mb-3">
          <p class="text-xs text-muted mb-1">
            Active VPS
          </p>
          <USelect
            v-model="activeVpsId"
            :items="vpsItems"
            value-key="value"
            placeholder="Select VPS"
            class="w-full"
          />
        </div>

        <UNavigationMenu
          :collapsed="collapsed"
          :items="links[0]"
          orientation="vertical"
          tooltip
        />
      </template>

      <template #footer="{ collapsed }">
        <div class="flex items-center gap-2 px-2 py-2">
          <UAvatar :alt="user?.username || 'admin'" size="xs" />
          <div v-if="!collapsed" class="min-w-0 flex-1">
            <p class="text-sm truncate">
              {{ user?.username }}
            </p>
            <UButton size="xs" color="neutral" variant="ghost" label="Logout" @click="onLogout" />
          </div>
        </div>
      </template>
    </UDashboardSidebar>

    <slot />
  </UDashboardGroup>
</template>
