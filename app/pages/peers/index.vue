<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { PeerRow } from '~/types'
import { formatBytes, formatLocalTime } from '~/utils/format'

const toast = useToast()
const { data, status, refresh } = await useFetch<PeerRow[]>('/api/peers', { default: () => [] })

const revokeOpen = ref(false)
const revokeTarget = ref<PeerRow | null>(null)
const showKeys = ref(false)

const columns: TableColumn<PeerRow>[] = [
  { accessorKey: 'deviceName', header: 'Device' },
  { accessorKey: 'vpnIp', header: 'VPN IP' },
  {
    accessorKey: 'publicKeyMasked',
    header: 'Public key',
    cell: ({ row }) => showKeys.value ? row.original.publicKey : row.original.publicKeyMasked
  },
  {
    accessorKey: 'latestHandshake',
    header: 'Handshake',
    cell: ({ row }) => formatLocalTime(row.original.latestHandshake)
  },
  {
    accessorKey: 'rxBytes',
    header: 'Download',
    cell: ({ row }) => formatBytes(row.original.rxBytes)
  },
  {
    accessorKey: 'txBytes',
    header: 'Upload',
    cell: ({ row }) => formatBytes(row.original.txBytes)
  },
  {
    accessorKey: 'createdAt',
    header: 'Created',
    cell: ({ row }) => formatLocalTime(row.original.createdAt)
  },
  {
    accessorKey: 'isActive',
    header: 'Status',
    cell: ({ row }) => row.original.isActive ? 'active' : 'revoked'
  },
  { id: 'actions', header: '' }
]

async function revokePeer() {
  if (!revokeTarget.value) return
  await $fetch(`/api/peers/${revokeTarget.value.id}?confirm=1`, { method: 'DELETE', body: { confirm: true } })
  toast.add({ title: 'Peer revoked', color: 'success' })
  revokeOpen.value = false
  revokeTarget.value = null
  await refresh()
}

async function copyPeerConfig(peer: PeerRow) {
  try {
    const res = await $fetch<{ clientConfig: string }>(`/api/peers/${peer.id}/config`)
    await navigator.clipboard.writeText(res.clientConfig)
    toast.add({ title: `Copied ${peer.deviceName}.conf`, color: 'success' })
  } catch (e: unknown) {
    toast.add({
      title: 'Config unavailable',
      description: (e as { data?: { statusMessage?: string } }).data?.statusMessage || (e as { message?: string }).message,
      color: 'warning'
    })
  }
}
</script>

<template>
  <UDashboardPanel id="peers">
    <template #header>
      <UDashboardNavbar title="Peers">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            color="neutral"
            variant="ghost"
            :label="showKeys ? 'Mask keys' : 'Show keys'"
            @click="showKeys = !showKeys"
          />
          <UButton
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="ghost"
            :loading="status === 'pending'"
            @click="refresh()"
          />
          <UButton icon="i-lucide-plus" label="Add peer" to="/peers/add" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UTable
        :data="data || []"
        :columns="columns"
        :loading="status === 'pending'"
        class="w-full"
      >
        <template #actions-cell="{ row }">
          <div class="flex justify-end gap-1">
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              icon="i-lucide-eye"
              :to="`/peers/${row.original.id}`"
            />
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              icon="i-lucide-copy"
              :disabled="!row.original.isActive"
              @click="copyPeerConfig(row.original)"
            />
            <UButton
              size="xs"
              color="error"
              variant="ghost"
              icon="i-lucide-trash"
              :disabled="!row.original.isActive"
              @click="revokeTarget = row.original; revokeOpen = true"
            />
          </div>
        </template>
      </UTable>

      <div v-if="!(data || []).length" class="py-12 text-center text-muted text-sm">
        No peers yet. Add a device to get started.
      </div>

      <UModal v-model:open="revokeOpen" title="Revoke peer" description="This removes the peer from WireGuard on the VPS. This cannot be undone.">
        <template #body>
          <p class="text-sm mb-4">
            Revoke <strong>{{ revokeTarget?.deviceName }}</strong> ({{ revokeTarget?.vpnIp }})?
          </p>
          <div class="flex justify-end gap-2">
            <UButton
              label="Cancel"
              color="neutral"
              variant="subtle"
              @click="revokeOpen = false"
            />
            <UButton
              label="Revoke"
              color="error"
              loading-auto
              @click="revokePeer"
            />
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
