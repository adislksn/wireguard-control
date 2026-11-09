<script setup lang="ts">
const toast = useToast()
const deviceName = ref('')
const deviceType = ref<'phone' | 'tablet' | 'laptop' | 'desktop' | 'router' | 'other'>('phone')
const description = ref('')
const loading = ref(false)
const result = ref<{ peer: any, clientConfig: string, vpnIp: string } | null>(null)
const qr = ref<string | null>(null)

async function onSubmit() {
  loading.value = true
  try {
    result.value = await $fetch('/api/peers', {
      method: 'POST',
      body: {
        deviceName: deviceName.value,
        deviceType: deviceType.value,
        description: description.value || undefined
      }
    })
    if (result.value?.clientConfig) {
      const qrRes = await $fetch<{ dataUrl: string }>(`/api/peers/${result.value.peer.id}/qr`, {
        method: 'POST',
        body: { clientConfig: result.value.clientConfig }
      })
      qr.value = qrRes.dataUrl
    }
    toast.add({ title: 'Peer created', color: 'success' })
  } catch (e: any) {
    toast.add({ title: 'Failed', description: e?.data?.statusMessage || e?.message, color: 'error' })
  } finally {
    loading.value = false
  }
}

function downloadConfig() {
  if (!result.value?.clientConfig) return
  const blob = new Blob([result.value.clientConfig], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${deviceName.value || 'peer'}.conf`
  a.click()
  URL.revokeObjectURL(url)
}

async function copyConfig() {
  if (!result.value?.clientConfig) return
  await navigator.clipboard.writeText(result.value.clientConfig)
  toast.add({ title: 'Copied .conf', color: 'success' })
}
</script>

<template>
  <UDashboardPanel id="add-peer">
    <template #header>
      <UDashboardNavbar title="Add peer">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton to="/peers" color="neutral" variant="ghost" label="Back" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="max-w-xl space-y-6">
        <form v-if="!result" class="space-y-4" @submit.prevent="onSubmit">
          <UFormField label="Device name" required>
            <UInput v-model="deviceName" placeholder="Handphone Anak 1" class="w-full" required />
          </UFormField>
          <UFormField label="Device type">
            <USelect
              v-model="deviceType"
              :items="['phone', 'tablet', 'laptop', 'desktop', 'router', 'other']"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Description">
            <UTextarea v-model="description" class="w-full" />
          </UFormField>
          <UButton type="submit" label="Create peer" :loading="loading" />
        </form>

        <div v-else class="space-y-4">
          <UAlert
            color="success"
            title="Peer ready"
            :description="`VPN IP ${result.vpnIp}. Config is saved on the VPS (not in SQLite) so you can copy it again later.`"
          />
          <div v-if="qr" class="flex justify-center">
            <img :src="qr" alt="WireGuard QR code" class="rounded-lg border border-default">
          </div>
          <UTextarea :model-value="result.clientConfig" readonly :rows="10" class="w-full font-mono text-xs" />
          <div class="flex gap-2">
            <UButton label="Copy .conf" icon="i-lucide-copy" @click="copyConfig" />
            <UButton label="Download .conf" icon="i-lucide-download" color="neutral" variant="outline" @click="downloadConfig" />
            <UButton label="View peer" :to="`/peers/${result.peer.id}`" color="neutral" variant="ghost" />
          </div>
          <ol class="text-sm text-muted list-decimal ps-5 space-y-1">
            <li>Install the WireGuard app on Android or iOS.</li>
            <li>Tap Create → Scan QR code, or import the downloaded config file.</li>
            <li>Enable the tunnel. Client DNS defaults to Google (8.8.8.8 / 8.8.4.4); change it in Settings if needed.</li>
          </ol>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
