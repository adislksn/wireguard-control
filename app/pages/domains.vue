<script setup lang="ts">
import { formatLocalTime } from '~/utils/format'

const search = ref('')
const page = ref(1)

const { data, status, refresh } = await useFetch(() => {
  const q = new URLSearchParams({
    search: search.value,
    page: String(page.value),
    pageSize: '50'
  })
  return `/api/domains?${q}`
}, { watch: [search, page], default: () => ({ items: [], disclaimer: '' }) })
</script>

<template>
  <UDashboardPanel id="domains">
    <template #header>
      <UDashboardNavbar title="Domain activity">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="status === 'pending'" @click="refresh()" />
        </template>
      </UDashboardNavbar>
      <UDashboardToolbar>
        <UInput v-model="search" icon="i-lucide-search" placeholder="Search domain" class="w-72" />
      </UDashboardToolbar>
    </template>

    <template #body>
      <UAlert class="mb-4" color="warning" variant="subtle" :title="data?.disclaimer || 'DNS disclaimer'" />
      <UAlert
        class="mb-4"
        color="neutral"
        variant="subtle"
        title="Domain logging requires VPN DNS"
        description="Peer profiles must use DNS = 10.7.0.1 (not 8.8.8.8). After changing, re-import the .conf on each device. Android Private DNS / app DoH can still hide lookups."
      />

      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead class="text-left text-muted border-b border-default">
            <tr>
              <th class="py-2 pe-3">Timestamp</th>
              <th class="py-2 pe-3">Device</th>
              <th class="py-2 pe-3">VPN IP</th>
              <th class="py-2 pe-3">Domain</th>
              <th class="py-2">Type</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in data?.items || []" :key="row.id" class="border-b border-default/60">
              <td class="py-2 pe-3 whitespace-nowrap">{{ formatLocalTime(row.timestamp) }}</td>
              <td class="py-2 pe-3">{{ row.deviceName || '—' }}</td>
              <td class="py-2 pe-3 font-mono">{{ row.clientIp }}</td>
              <td class="py-2 pe-3">{{ row.domain }}</td>
              <td class="py-2">{{ row.recordType }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="!(data?.items || []).length" class="py-10 text-center text-muted text-sm">
        No DNS records collected yet. Re-import peer configs with VPN DNS (10.7.0.1), then browse on the device.
      </div>

      <div class="flex justify-end gap-2 mt-4">
        <UButton color="neutral" variant="outline" :disabled="page <= 1" label="Previous" @click="page--" />
        <UButton color="neutral" variant="outline" label="Next" @click="page++" />
      </div>
    </template>
  </UDashboardPanel>
</template>
