<script setup lang="ts">
import type { PeerOnlineStatus, QuietHoursConfig } from '~/types'
import { formatBytes, formatLocalTime } from '~/utils/format'

const route = useRoute()
const toast = useToast()
const id = computed(() => route.params.id as string)

const { data, refresh } = await useFetch(() => `/api/peers/${id.value}`)
const { data: traffic } = await useFetch(() => `/api/peers/${id.value}/traffic?days=7`, { default: () => [] })
const { data: settings } = await useFetch('/api/settings')

const clientConfig = ref('')
const configOpen = ref(false)
const configLoading = ref(false)
const qr = ref<string | null>(null)
const clearDomainsOpen = ref(false)
const clearDomainsLoading = ref(false)
const pauseLoading = ref(false)
const policySaving = ref(false)

const dayOptions = [
  { label: 'Sun', value: 0 },
  { label: 'Mon', value: 1 },
  { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 },
  { label: 'Thu', value: 4 },
  { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 }
]

const policy = reactive({
  expiresAtLocal: '' as string,
  quietHoursEnabled: false,
  quietDays: [0, 1, 2, 3, 4, 5, 6] as number[],
  quietStart: '22:00',
  quietEnd: '07:00',
  timezone: 'UTC',
  dailyCapGb: '' as string,
  quotaWarnPercent: 80
})

watch(() => data.value?.peer, (peer) => {
  if (!peer) return
  policy.expiresAtLocal = peer.expiresAt
    ? new Date(peer.expiresAt).toISOString().slice(0, 16)
    : ''
  policy.quietHoursEnabled = Boolean(peer.quietHoursEnabled)
  const qh = peer.quietHours as QuietHoursConfig | null
  policy.quietDays = qh?.days?.length ? [...qh.days] : [0, 1, 2, 3, 4, 5, 6]
  policy.quietStart = qh?.start || '22:00'
  policy.quietEnd = qh?.end || '07:00'
  policy.timezone = qh?.timezone || settings.value?.timezone || 'UTC'
  policy.dailyCapGb = peer.dailyCapBytes != null
    ? String(Math.round((peer.dailyCapBytes / (1024 ** 3)) * 100) / 100)
    : ''
  policy.quotaWarnPercent = peer.quotaWarnPercent ?? 80
}, { immediate: true })

const chartData = computed(() => (traffic.value || []).map((row: { timestamp: string, rxBytes: number, txBytes: number }) => ({
  date: formatLocalTime(row.timestamp),
  download: row.rxBytes,
  upload: row.txBytes
})))

function statusColor(s?: PeerOnlineStatus) {
  if (s === 'online') return 'success'
  if (s === 'paused' || s === 'expired') return 'warning'
  if (s === 'revoked') return 'error'
  return 'neutral'
}

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

async function togglePause() {
  if (!data.value?.peer?.isActive) return
  pauseLoading.value = true
  try {
    const path = data.value.peer.paused ? 'unpause' : 'pause'
    await $fetch(`/api/peers/${id.value}/${path}` as string, { method: 'POST' })
    toast.add({ title: data.value.peer.paused ? 'Peer resumed' : 'Peer paused', color: 'success' })
    await refresh()
  } catch (e: unknown) {
    toast.add({
      title: 'Action failed',
      description: (e as { data?: { statusMessage?: string } }).data?.statusMessage || (e as { message?: string }).message,
      color: 'error'
    })
  } finally {
    pauseLoading.value = false
  }
}

function toggleQuietDay(day: number) {
  if (policy.quietDays.includes(day)) {
    policy.quietDays = policy.quietDays.filter(d => d !== day)
  } else {
    policy.quietDays = [...policy.quietDays, day].sort()
  }
}

async function savePolicy() {
  policySaving.value = true
  try {
    const dailyCapBytes = policy.dailyCapGb.trim() === ''
      ? null
      : Math.round(Number(policy.dailyCapGb) * (1024 ** 3))
    if (dailyCapBytes != null && (!Number.isFinite(dailyCapBytes) || dailyCapBytes < 0)) {
      throw new Error('Invalid daily cap')
    }
    const expiresAt = policy.expiresAtLocal
      ? new Date(policy.expiresAtLocal).toISOString()
      : null
    await $fetch(`/api/peers/${id.value}` as string, {
      method: 'PATCH',
      body: {
        expiresAt,
        quietHoursEnabled: policy.quietHoursEnabled,
        quietHours: policy.quietHoursEnabled
          ? {
              days: policy.quietDays,
              start: policy.quietStart,
              end: policy.quietEnd,
              timezone: policy.timezone || 'UTC'
            }
          : null,
        dailyCapBytes,
        quotaWarnPercent: policy.quotaWarnPercent
      }
    })
    toast.add({ title: 'Access policy saved', color: 'success' })
    await refresh()
  } catch (e: unknown) {
    toast.add({
      title: 'Save failed',
      description: (e as { data?: { statusMessage?: string } }).data?.statusMessage || (e as { message?: string }).message,
      color: 'error'
    })
  } finally {
    policySaving.value = false
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
            :icon="data.peer.paused ? 'i-lucide-play' : 'i-lucide-pause'"
            :label="data.peer.paused ? 'Resume' : 'Pause'"
            color="warning"
            variant="soft"
            :loading="pauseLoading"
            @click="togglePause"
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
              </dt>
              <dd>
                <UBadge
                  :color="statusColor(data.onlineStatus)"
                  variant="subtle"
                  :label="data.onlineStatus"
                />
                <span
                  v-if="data.peer.pausedReason"
                  class="ms-2 text-xs text-muted"
                >{{ data.peer.pausedReason.replace('_', ' ') }}</span>
              </dd>
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
            Access policy
          </template>
          <div class="space-y-4">
            <UAlert
              v-if="data.quotaWarnReached && data.peer.dailyCapBytes"
              color="warning"
              variant="subtle"
              title="Soft warn: daily quota threshold reached"
              :description="`Used ${formatBytes(data.quotaUsedBytes || 0)} of ${formatBytes(data.peer.dailyCapBytes)} today.`"
            />
            <div class="grid gap-3 sm:grid-cols-2">
              <UFormField label="Expires at (local)">
                <UInput
                  v-model="policy.expiresAtLocal"
                  type="datetime-local"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="Daily cap (GB)">
                <UInput
                  v-model="policy.dailyCapGb"
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder="Unlimited"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="Quota warn %">
                <UInput
                  v-model.number="policy.quotaWarnPercent"
                  type="number"
                  min="1"
                  max="100"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="Timezone">
                <UInput
                  v-model="policy.timezone"
                  placeholder="UTC"
                  class="w-full"
                />
              </UFormField>
            </div>
            <UFormField label="Quiet hours">
              <UCheckbox
                v-model="policy.quietHoursEnabled"
                label="Auto-pause during quiet hours (enforced on VPS)"
              />
            </UFormField>
            <div
              v-if="policy.quietHoursEnabled"
              class="grid gap-3 sm:grid-cols-2"
            >
              <UFormField label="Start">
                <UInput
                  v-model="policy.quietStart"
                  type="time"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="End">
                <UInput
                  v-model="policy.quietEnd"
                  type="time"
                  class="w-full"
                />
              </UFormField>
              <div class="sm:col-span-2 flex flex-wrap gap-2">
                <UButton
                  v-for="d in dayOptions"
                  :key="d.value"
                  size="xs"
                  :color="policy.quietDays.includes(d.value) ? 'primary' : 'neutral'"
                  :variant="policy.quietDays.includes(d.value) ? 'solid' : 'outline'"
                  :label="d.label"
                  @click="toggleQuietDay(d.value)"
                />
              </div>
            </div>
            <p
              v-if="data.peer.dailyCapBytes"
              class="text-sm text-muted"
            >
              Today: {{ formatBytes(data.quotaUsedBytes || 0) }} / {{ formatBytes(data.peer.dailyCapBytes) }}
            </p>
            <UButton
              label="Save policy"
              :loading="policySaving"
              :disabled="!data.peer.isActive"
              @click="savePolicy"
            />
          </div>
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
