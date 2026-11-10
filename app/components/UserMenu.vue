<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

defineProps<{
  collapsed?: boolean
}>()

const colorMode = useColorMode()
const appConfig = useAppConfig()
const { user, logout } = useAuth()

const colors = ['red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose']
const neutrals = ['slate', 'gray', 'zinc', 'neutral', 'stone']

async function onLogout() {
  await logout()
  await navigateTo('/login')
}

const items = computed<DropdownMenuItem[][]>(() => {
  const username = user.value?.username || 'admin'

  return [[
    {
      type: 'label',
      label: username,
      avatar: { alt: username }
    }
  ], [
    {
      label: 'Settings',
      icon: 'i-lucide-settings',
      to: '/settings'
    }
  ], [
    {
      label: 'Theme',
      icon: 'i-lucide-palette',
      children: [{
        label: 'Primary',
        slot: 'chip',
        chip: appConfig.ui.colors.primary,
        content: {
          align: 'center',
          collisionPadding: 16
        },
        children: colors.map(color => ({
          label: color,
          chip: color,
          slot: 'chip',
          checked: appConfig.ui.colors.primary === color,
          type: 'checkbox' as const,
          onSelect: (e: Event) => {
            e.preventDefault()
            appConfig.ui.colors.primary = color
          }
        }))
      }, {
        label: 'Neutral',
        slot: 'chip',
        chip: appConfig.ui.colors.neutral === 'neutral' ? 'old-neutral' : appConfig.ui.colors.neutral,
        content: {
          align: 'end',
          collisionPadding: 16
        },
        children: neutrals.map(color => ({
          label: color,
          chip: color === 'neutral' ? 'old-neutral' : color,
          slot: 'chip',
          type: 'checkbox' as const,
          checked: appConfig.ui.colors.neutral === color,
          onSelect: (e: Event) => {
            e.preventDefault()
            appConfig.ui.colors.neutral = color
          }
        }))
      }]
    },
    {
      label: 'Appearance',
      icon: 'i-lucide-sun-moon',
      children: [{
        label: 'Light',
        icon: 'i-lucide-sun',
        type: 'checkbox' as const,
        checked: colorMode.value === 'light',
        onSelect(e: Event) {
          e.preventDefault()
          colorMode.preference = 'light'
        }
      }, {
        label: 'Dark',
        icon: 'i-lucide-moon',
        type: 'checkbox' as const,
        checked: colorMode.value === 'dark',
        onSelect(e: Event) {
          e.preventDefault()
          colorMode.preference = 'dark'
        }
      }]
    }
  ], [
    {
      label: 'Log out',
      icon: 'i-lucide-log-out',
      color: 'error' as const,
      onSelect: () => {
        void onLogout()
      }
    }
  ]]
})
</script>

<template>
  <UTooltip
    :text="user?.username || 'admin'"
    :disabled="!collapsed"
    :content="{ side: 'right', sideOffset: 8 }"
  >
    <UDropdownMenu
      :items="items"
      :content="{ align: 'center', collisionPadding: 12, side: collapsed ? 'right' : 'top' }"
      :ui="{ content: collapsed ? 'w-48' : 'w-(--reka-dropdown-menu-trigger-width)' }"
    >
      <UButton
        :avatar="{ alt: user?.username || 'admin' }"
        :label="collapsed ? undefined : (user?.username || 'admin')"
        :trailing-icon="collapsed ? undefined : 'i-lucide-chevrons-up-down'"
        color="neutral"
        variant="ghost"
        block
        :square="collapsed"
        class="data-[state=open]:bg-elevated"
        :ui="{ trailingIcon: 'text-dimmed' }"
      />

      <template #chip-leading="{ item }">
        <div class="inline-flex items-center justify-center shrink-0 size-5">
          <span
            class="rounded-full ring ring-bg bg-(--chip-light) dark:bg-(--chip-dark) size-2"
            :style="{
              '--chip-light': `var(--color-${(item as { chip?: string }).chip}-500)`,
              '--chip-dark': `var(--color-${(item as { chip?: string }).chip}-400)`
            }"
          />
        </div>
      </template>
    </UDropdownMenu>
  </UTooltip>
</template>
