<script setup lang="ts">
import { formatBytes, formatLocalTime } from '~/utils/format'

const route = useRoute()
const toast = useToast()
const id = computed(() => route.params.id as string)

const { data, refresh } = await useFetch(() => `/api/peers/${id.value}`)
const { data: traffic } = await useFetch(() => `/api/peers/${id.value}/traffic?days=7`, { default: () => [] })

const clientConfig = ref('')
const configOpen = ref(false)
const configLoading = ref(false)
const qr = ref<string | null>(null)
const clearDomainsOpen = ref(false)
const clearDomainsLoading = ref(false)

const chartData = computed(() => (traffic.value || []).map((row: { timestamp: string, rxBytes: number, txBytes: number }) => ({
  date: formatLocalTime(row.timestamp),
  download: row.rxBytes,
  upload: row.txBytes
})))

async function loadConfig() {
  configLoading.value = true
  qr.value = null
  try {
    const res = await $fetch<{ clientConfig: string, deviceName: string }>(`/api/peers/${id.value}/config`)
    clientConfig.value = res.clientConfig
    configOpen.value = true
    const qrRes = await $fetch<{ dataUrl: string }>(`/api/peers/${id.value}/qr`, {
      method: 'POST',
      body: { clientConfig: res.clientConfig }
    })
    qr.value = qrRes.dataUrl
  } catch (e: unknown) {
    toast.add({
      title: 'Config unavailable',
      description: (e as { data?: { statusMessage?: string } }).data?.statusMessage || (e as { message?: string }).message,
      color: 'warning'
    })
  } finally {
    configLoading.value = false
  }
}

async function copyConfig() {
  if (!clientConfig.value) {
    await loadConfig()
  }
  if (!clientConfig.value) return
  await navigator.clipboard.writeText(clientConfig.value)
  toast.add({ title: 'Copied .conf to clipboard', color: 'success' })
}

function downloadConfig() {
  if (!clientConfig.value || !data.value?.peer) return
  const blob = new Blob([clientConfig.value], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${data.value.peer.deviceName}.conf`
  a.click()
  URL.revokeObjectURL(url)
}

async function clearDomainHistory() {
  clearDomainsLoading.value = true
  try {
    const res = await $fetch<{ ok: boolean, deletedCount: number }>(`/api/peers/${id.value}/domains?confirm=1` as string, {
      method: 'DELETE',
      body: { confirm: true }
    })
    clearDomainsOpen.value = false
    toast.add({
      title: 'Domain history cleared',
      description: `${res.deletedCount} DNS record${res.deletedCount === 1 ? '' : 's'} deleted`,
      color: 'success'
    })
    await refresh()
  } catch (e: unknown) {
    toast.add({
      title: 'Clear failed',
      description: (e as { data?: { statusMessage?: string } }).data?.statusMessage || (e as { message?: string }).message,
      color: 'error'
    })
  } finally {
    clearDomainsLoading.value = false
  }
}
</script>

<template>
  <UDashboardPanel :id="`peer-${id}`">
    <template #header>
      <UDashboardNavbar :title="data?.peer?.deviceName || 'Peer'">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            to="/peers"
            color="neutral"
            variant="ghost"
            label="Back"
          />
          <UButton
            v-if="data?.peer?.isActive"
            icon="i-lucide-file-key"
            label="Get .conf"
            color="neutral"
            variant="outline"
            :loading="configLoading"
            @click="loadConfig"
          />
          <UButton
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="ghost"
            @click="refresh()"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="data?.peer" class="space-y-6">
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <UCard>
            <p class="text-xs text-muted">
              VPN IP
            </p><p class="text-lg font-semibold">
              {{ data.peer.vpnIp }}
            </p>
          </UCard>
          <UCard>
            <p class="text-xs text-muted">
              Download
            </p><p class="text-lg font-semibold">
              {{ formatBytes(data.latest?.rxBytes || 0) }}
            </p>
          </UCard>
          <UCard>
            <p class="text-xs text-muted">
              Upload
            </p><p class="text-lg font-semibold">
              {{ formatBytes(data.latest?.txBytes || 0) }}
            </p>
          </UCard>
          <UCard>
            <p class="text-xs text-muted">
              DNS queries
            </p><p class="text-lg font-semibold">
              {{ data.dnsQueryCount }}
            </p>
          </UCard>
        </div>

        <UCard>
          <template #header>
            Device
          </template>
          <dl class="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt class="text-muted">
                Type
              </dt><dd>{{ data.peer.deviceType }}</dd>
            </div>
            <div>
              <dt class="text-muted">
                Created
              </dt><dd>{{ formatLocalTime(data.peer.createdAt) }}</dd>
            </div>
            <div>
              <dt class="text-muted">
                Handshake
              </dt><dd>{{ formatLocalTime(data.latest?.latestHandshake) }}</dd>
            </div>
            <div>
              <dt class="text-muted">
                Status
              </dt><dd>{{ data.peer.isActive ? 'active' : 'revoked' }}</dd>
            </div>
            <div class="sm:col-span-2">
              <dt class="text-muted">
                Public key
              </dt><dd class="font-mono break-all">
                {{ data.peer.publicKey }}
              </dd>
            </div>
            <div class="sm:col-span-2">
              <dt class="text-muted">
                Description
              </dt><dd>{{ data.peer.description || '—' }}</dd>
            </div>
          </dl>
        </UCard>

        <UCard>
          <template #header>
            Bandwidth (snapshots)
          </template>
          <UChart
            v-if="chartData.length"
            type="line"
            curve="monotone"
            :data="chartData"
            index="date"
            :categories="[
              { key: 'download', label: 'Download', color: 'primary' },
              { key: 'upload', label: 'Upload', color: 'warning' }
            ]"
            :height="280"
            aria-label="Peer bandwidth"
          />
          <p v-else class="text-sm text-muted">
            No traffic snapshots yet.
          </p>
        </UCard>

        <UCard>
          <template #header>
            <div class="flex items-center justify-between gap-3">
              <span>Recent domains</span>
              <UButton
                v-if="(data.dnsQueryCount || 0) > 0"
                size="xs"
                color="error"
                variant="soft"
                icon="i-lucide-trash-2"
                label="Clear history"
                @click="clearDomainsOpen = true"
              />
            </div>
          </template>
          <UAlert
            class="mb-3"
            color="neutral"
            variant="subtle"
            title="DNS is not browsing history"
            description="These are DNS lookups only and may not reflect deliberate page visits."
          />
          <ul v-if="data.recentDomains?.length" class="divide-y divide-default text-sm">
            <li v-for="row in data.recentDomains" :key="row.id" class="py-2 flex justify-between gap-3">
              <span class="truncate">{{ row.domain }}</span>
              <span class="text-muted shrink-0">{{ formatLocalTime(row.timestamp) }}</span>
            </li>
          </ul>
          <p v-else class="text-sm text-muted">
            No DNS lookups yet. Peer must use DNS = 10.7.0.1 (re-import .conf), and Android Private DNS should be Off/Automatic.
          </p>
        </UCard>
      </div>

      <UModal
        v-model:open="clearDomainsOpen"
        title="Clear domain history"
        :description="`Delete all DNS lookup records for ${data?.peer?.deviceName || 'this peer'}? This cannot be undone.`"
      >
        <template #body>
          <div class="flex justify-end gap-2">
            <UButton
              color="neutral"
              variant="ghost"
              label="Cancel"
              @click="clearDomainsOpen = false"
            />
            <UButton
              color="error"
              icon="i-lucide-trash-2"
              label="Delete history"
              :loading="clearDomainsLoading"
              @click="clearDomainHistory"
            />
          </div>
        </template>
      </UModal>

      <UModal v-model:open="configOpen" title="Client configuration" description="Treat this like a secret. Anyone with this file can use the VPN as this device.">
        <template #body>
          <div class="space-y-4">
            <div v-if="qr" class="flex justify-center">
              <img :src="qr" alt="WireGuard QR code" class="rounded-lg border border-default">
            </div>
            <UTextarea
              :model-value="clientConfig"
              readonly
              :rows="14"
              class="w-full font-mono text-xs"
            />
            <div class="flex justify-end gap-2">
              <UButton label="Copy" icon="i-lucide-copy" @click="copyConfig" />
              <UButton
                label="Download"
                icon="i-lucide-download"
                color="neutral"
                variant="outline"
                @click="downloadConfig"
              />
            </div>
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
