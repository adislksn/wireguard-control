<script setup lang="ts">
import type { DashboardOverview } from '~/types'
import { formatBytes, formatLocalTime } from '~/utils/format'

const { data, status, refresh } = await useFetch<DashboardOverview>('/api/dashboard/overview', {
  default: () => ({
    vps: null,
    totals: { peers: 0, activePeers: 0, rxBytes: 0, txBytes: 0, dnsToday: 0 },
    health: null,
    recentAudit: [],
    connection: 'disconnected'
  })
})

const cards = computed(() => [
  { title: 'Connection', value: data.value?.connection || '—', icon: 'i-lucide-plug' },
  { title: 'Active peers', value: String(data.value?.totals.activePeers || 0), icon: 'i-lucide-smartphone' },
  { title: 'Download', value: formatBytes(data.value?.totals.rxBytes || 0), icon: 'i-lucide-download' },
  { title: 'Upload', value: formatBytes(data.value?.totals.txBytes || 0), icon: 'i-lucide-upload' },
  { title: 'DNS today', value: String(data.value?.totals.dnsToday || 0), icon: 'i-lucide-globe' },
  { title: 'RAM used', value: data.value?.health?.memory ? `${data.value.health.memory.usedPercent}%` : '—', icon: 'i-lucide-memory-stick' },
  { title: 'Load (1m)', value: data.value?.health?.cpu ? String(data.value.health.cpu.load1) : '—', icon: 'i-lucide-cpu' },
  { title: 'Recently active', value: String(data.value?.totals.recentlyActive || 0), icon: 'i-lucide-activity' }
])
</script>

<template>
  <UDashboardPanel id="overview">
    <template #header>
      <UDashboardNavbar title="Overview">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="ghost"
            :loading="status === 'pending'"
            @click="refresh()"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-6">
        <UAlert
          v-if="!data?.vps"
          title="No active VPS"
          description="Add a VPS in Settings and activate it to begin monitoring."
          icon="i-lucide-server"
          color="warning"
        />

        <div v-else class="text-sm text-muted">
          Active: <span class="text-highlighted font-medium">{{ data.vps.name }}</span>
          ({{ data.vps.host }}) · WG {{ data.vps.wgInterface || '—' }} · {{ data.vps.status }}
        </div>

        <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <UCard v-for="card in cards" :key="card.title">
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="text-xs uppercase text-muted mb-1">
                  {{ card.title }}
                </p>
                <p class="text-2xl font-semibold">
                  {{ card.value }}
                </p>
              </div>
              <UIcon :name="card.icon" class="size-5 text-muted" />
            </div>
          </UCard>
        </div>

        <UCard>
          <template #header>
            <p class="font-medium">
              Recent admin events
            </p>
          </template>
          <div v-if="!data?.recentAudit?.length" class="text-sm text-muted">
            No events yet.
          </div>
          <ul v-else class="divide-y divide-default">
            <li v-for="item in data.recentAudit" :key="item.id" class="py-2 flex items-center justify-between gap-4 text-sm">
              <div>
                <p class="font-medium">
                  {{ item.action }}
                </p>
                <p class="text-muted">
                  {{ item.result }}
                </p>
              </div>
              <span class="text-muted shrink-0">{{ formatLocalTime(item.timestamp) }}</span>
            </li>
          </ul>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
