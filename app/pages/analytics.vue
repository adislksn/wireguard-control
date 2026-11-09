<script setup lang="ts">
import { formatBytes } from '~/utils/format'

const days = ref(7)
const { data, refresh, status } = await useFetch(() => `/api/analytics/traffic?days=${days.value}`, {
  watch: [days],
  default: () => ({ series: [], byPeer: [] })
})

const chartData = computed(() => (data.value?.series || []).map((row: { date: string, rxBytes: number, txBytes: number }) => ({
  date: row.date,
  download: Number(row.rxBytes || 0),
  upload: Number(row.txBytes || 0)
})))

const dayItems = [
  { label: '7 days', value: 7 },
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 }
]
</script>

<template>
  <UDashboardPanel id="analytics">
    <template #header>
      <UDashboardNavbar title="Traffic analytics">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <USelect
            v-model="days"
            :items="dayItems"
            value-key="value"
            class="w-36"
          />
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
        <UCard>
          <template #header>
            Daily RX / TX (counter snapshots)
          </template>
          <UChart
            v-if="chartData.length"
            type="area"
            curve="monotone"
            :data="chartData"
            index="date"
            :categories="[
              { key: 'download', label: 'Download', color: 'primary' },
              { key: 'upload', label: 'Upload', color: 'warning' }
            ]"
            :height="320"
            aria-label="Daily traffic"
          />
          <p v-else class="text-sm text-muted">
            No analytics data yet.
          </p>
        </UCard>

        <UCard>
          <template #header>
            Per-device usage
          </template>
          <ul class="divide-y divide-default text-sm">
            <li v-for="peer in data?.byPeer || []" :key="peer.publicKey" class="py-2 flex justify-between gap-3">
              <span>{{ peer.deviceName }}</span>
              <span class="text-muted">↓ {{ formatBytes(peer.rxBytes) }} · ↑ {{ formatBytes(peer.txBytes) }}</span>
            </li>
          </ul>
          <p v-if="!(data?.byPeer || []).length" class="text-sm text-muted">
            No per-device data yet.
          </p>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
