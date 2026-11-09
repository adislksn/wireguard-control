<script setup lang="ts">
import type { VpsHost } from '~/types'

const toast = useToast()
const { data: vpsList, refresh: refreshVps } = await useFetch<VpsHost[]>('/api/vps', { default: () => [] })
const { data: settings, refresh: refreshSettings } = await useFetch('/api/settings')

const form = reactive({
  name: '',
  host: '',
  sshPort: 22,
  sshUser: 'root',
  password: '',
  wgSubnet: '10.7.0.0/24',
  serverVpnIp: '10.7.0.1',
  listenPort: 51820
})

const initForm = reactive({
  listenPort: 51820,
  wgSubnet: '10.7.0.0/24',
  serverVpnIp: '10.7.0.1',
  interfaceName: 'wg0',
  upstreamDns: '1.1.1.1',
  force: false
})

const purgeConfirm = ref('')
const selectedId = ref<number | null>(null)
const busy = ref(false)

async function addVps() {
  busy.value = true
  try {
    const res = await $fetch<{ vps: VpsHost, bootstrapError?: string | null }>('/api/vps', {
      method: 'POST',
      body: { ...form }
    })
    form.password = ''
    await refreshVps()
    selectedId.value = res.vps.id
    if (res.bootstrapError) {
      toast.add({ title: 'VPS saved with SSH warning', description: res.bootstrapError, color: 'warning' })
    } else {
      toast.add({ title: 'VPS added', color: 'success' })
    }
  } catch (e: unknown) {
    toast.add({ title: 'Failed', description: (e as { data?: { statusMessage?: string } }).data?.statusMessage ?? (e as { message?: string }).message, color: 'error' })
  } finally {
    busy.value = false
  }
}

async function activate(id: number) {
  await $fetch(`/api/vps/${id}/activate`, { method: 'POST' })
  await refreshVps()
  toast.add({ title: 'Active VPS switched', color: 'success' })
}

async function testConn(id: number) {
  busy.value = true
  try {
    await $fetch(`/api/vps/${id}/test`, { method: 'POST' })
    await refreshVps()
    toast.add({ title: 'SSH OK', color: 'success' })
  } catch (e: unknown) {
    toast.add({ title: 'SSH failed', description: (e as { data?: { statusMessage?: string } }).data?.statusMessage ?? (e as { message?: string }).message, color: 'error' })
    await refreshVps()
  } finally {
    busy.value = false
  }
}

async function initWg(id: number) {
  busy.value = true
  try {
    await $fetch(`/api/vps/${id}/init`, { method: 'POST', body: { ...initForm } })
    await refreshVps()
    toast.add({ title: 'WireGuard initialized', color: 'success' })
  } catch (e: unknown) {
    toast.add({ title: 'Init failed', description: (e as { data?: { statusMessage?: string } }).data?.statusMessage ?? (e as { message?: string }).message, color: 'error' })
  } finally {
    busy.value = false
  }
}

async function purgeWg(id: number) {
  if (purgeConfirm.value !== 'DELETE WIREGUARD') {
    toast.add({ title: 'Type DELETE WIREGUARD to confirm', color: 'warning' })
    return
  }
  busy.value = true
  try {
    await $fetch(`/api/vps/${id}/purge`, { method: 'POST', body: { confirm: 'DELETE WIREGUARD' } })
    purgeConfirm.value = ''
    await refreshVps()
    toast.add({ title: 'WireGuard removed', color: 'success' })
  } catch (e: unknown) {
    toast.add({ title: 'Purge failed', description: (e as { data?: { statusMessage?: string } }).data?.statusMessage ?? (e as { message?: string }).message, color: 'error' })
  } finally {
    busy.value = false
  }
}

async function saveSettings() {
  await $fetch('/api/settings', { method: 'PATCH', body: settings.value })
  await refreshSettings()
  toast.add({ title: 'Settings saved', color: 'success' })
}
</script>

<template>
  <UDashboardPanel id="settings">
    <template #header>
      <UDashboardNavbar title="Settings">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-8 max-w-4xl">
        <UCard>
          <template #header>
            VPS hosts
          </template>
          <div class="space-y-3 mb-6">
            <div
              v-for="vps in vpsList || []"
              :key="vps.id"
              class="rounded-lg border border-default p-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p class="font-medium">
                  {{ vps.name }}
                  <UBadge
                    v-if="vps.isActive"
                    color="success"
                    variant="subtle"
                    class="ms-2"
                  >
                    active
                  </UBadge>
                </p>
                <p class="text-sm text-muted">
                  {{ vps.sshUser }}@{{ vps.host }}:{{ vps.sshPort }} · {{ vps.status }}
                </p>
                <p v-if="vps.lastError" class="text-xs text-error mt-1">
                  {{ vps.lastError }}
                </p>
              </div>
              <div class="flex flex-wrap gap-2">
                <UButton
                  size="xs"
                  label="Activate"
                  :disabled="vps.isActive"
                  @click="activate(vps.id)"
                />
                <UButton
                  size="xs"
                  color="neutral"
                  variant="outline"
                  label="Test SSH"
                  :loading="busy"
                  @click="testConn(vps.id)"
                />
                <UButton
                  size="xs"
                  color="primary"
                  variant="soft"
                  label="Init WG"
                  :loading="busy"
                  @click="selectedId = vps.id; initWg(vps.id)"
                />
                <UButton
                  size="xs"
                  color="error"
                  variant="ghost"
                  label="Select for purge"
                  @click="selectedId = vps.id"
                />
              </div>
            </div>
            <p v-if="!(vpsList || []).length" class="text-sm text-muted">
              No VPS configured yet.
            </p>
          </div>

          <form class="grid gap-3 sm:grid-cols-2" @submit.prevent="addVps">
            <UFormField label="Name" class="sm:col-span-2">
              <UInput v-model="form.name" required class="w-full" />
            </UFormField>
            <UFormField label="Host / IP">
              <UInput v-model="form.host" required class="w-full" />
            </UFormField>
            <UFormField label="SSH port">
              <UInput v-model.number="form.sshPort" type="number" class="w-full" />
            </UFormField>
            <UFormField label="SSH user">
              <UInput v-model="form.sshUser" class="w-full" />
            </UFormField>
            <UFormField label="Bootstrap password (optional)">
              <UInput
                v-model="form.password"
                type="password"
                class="w-full"
                placeholder="Used once to install SSH key"
              />
            </UFormField>
            <UFormField label="Subnet">
              <UInput v-model="form.wgSubnet" class="w-full" />
            </UFormField>
            <UFormField label="Server VPN IP">
              <UInput v-model="form.serverVpnIp" class="w-full" />
            </UFormField>
            <div class="sm:col-span-2">
              <UButton type="submit" label="Add VPS" :loading="busy" />
            </div>
          </form>
        </UCard>

        <UCard>
          <template #header>
            WireGuard init defaults
          </template>
          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField label="Listen port">
              <UInput v-model.number="initForm.listenPort" type="number" class="w-full" />
            </UFormField>
            <UFormField label="Interface">
              <UInput v-model="initForm.interfaceName" class="w-full" />
            </UFormField>
            <UFormField label="Subnet">
              <UInput v-model="initForm.wgSubnet" class="w-full" />
            </UFormField>
            <UFormField label="Server IP">
              <UInput v-model="initForm.serverVpnIp" class="w-full" />
            </UFormField>
            <UFormField label="Upstream DNS">
              <UInput v-model="initForm.upstreamDns" class="w-full" />
            </UFormField>
            <UFormField label="Force re-init">
              <UCheckbox v-model="initForm.force" label="Overwrite existing WG after backup" />
            </UFormField>
          </div>
        </UCard>

        <UCard>
          <template #header>
            Clean remove WireGuard
          </template>
          <p class="text-sm text-muted mb-3">
            Selected VPS id: {{ selectedId || 'none' }}. Type <code>DELETE WIREGUARD</code> to confirm.
          </p>
          <div class="flex flex-col sm:flex-row gap-2">
            <UInput v-model="purgeConfirm" class="w-full" placeholder="DELETE WIREGUARD" />
            <UButton
              color="error"
              label="Purge WireGuard"
              :disabled="!selectedId"
              :loading="busy"
              @click="selectedId && purgeWg(selectedId)"
            />
          </div>
        </UCard>

        <UCard v-if="settings">
          <template #header>
            Collection & retention
          </template>
          <div class="grid gap-3 sm:grid-cols-2">
            <UFormField label="Peer stats interval (sec)">
              <UInput v-model.number="settings.peerStatsIntervalSec" type="number" class="w-full" />
            </UFormField>
            <UFormField label="DNS collect interval (sec)">
              <UInput v-model.number="settings.dnsCollectIntervalSec" type="number" class="w-full" />
            </UFormField>
            <UFormField label="Health interval (sec)">
              <UInput v-model.number="settings.healthIntervalSec" type="number" class="w-full" />
            </UFormField>
            <UFormField label="DNS retention (days)">
              <UInput v-model.number="settings.dnsRetentionDays" type="number" class="w-full" />
            </UFormField>
            <UFormField label="Stats retention (days)">
              <UInput v-model.number="settings.peerStatsRetentionDays" type="number" class="w-full" />
            </UFormField>
            <UFormField label="Timezone">
              <UInput v-model="settings.timezone" class="w-full" />
            </UFormField>
            <UFormField label="Client DNS (WireGuard profile)" class="sm:col-span-2">
              <UInput v-model="settings.clientDns" class="w-full" placeholder="10.7.0.1" />
              <p class="text-xs text-muted mt-1">
                Must be the VPN server IP (e.g. 10.7.0.1) for domain activity logging. Saving also rewrites stored peer .conf files — devices must re-import/Get .conf. Public DNS (8.8.8.8) skips logging.
              </p>
            </UFormField>
          </div>
          <UButton class="mt-4" label="Save settings" @click="saveSettings" />
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
