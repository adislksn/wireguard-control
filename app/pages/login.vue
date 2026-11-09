<script setup lang="ts">
definePageMeta({ layout: false })

const { login, user, refresh } = useAuth()
const username = ref('admin')
const password = ref('')
const error = ref('')
const loading = ref(false)

onMounted(async () => {
  await refresh()
  if (user.value) {
    await navigateTo('/')
  }
})

async function onSubmit() {
  loading.value = true
  error.value = ''
  try {
    await login(username.value, password.value)
    await navigateTo('/')
  } catch (e: unknown) {
    error.value = (e as { data?: { statusMessage?: string } }).data?.statusMessage ?? (e as { message?: string }).message ?? 'Login failed'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-default px-4">
    <div class="w-full max-w-sm space-y-6">
      <div class="text-center space-y-2">
        <UIcon name="i-lucide-shield" class="size-10 text-primary mx-auto" />
        <h1 class="text-2xl font-semibold">
          wgcontrol
        </h1>
        <p class="text-sm text-muted">
          wireguard-control · localhost administration
        </p>
      </div>

      <UCard>
        <form class="space-y-4" @submit.prevent="onSubmit">
          <UFormField label="Username">
            <UInput v-model="username" autocomplete="username" class="w-full" />
          </UFormField>
          <UFormField label="Password">
            <UInput
              v-model="password"
              type="password"
              autocomplete="current-password"
              class="w-full"
            />
          </UFormField>
          <p v-if="error" class="text-sm text-error">
            {{ error }}
          </p>
          <UButton
            type="submit"
            block
            :loading="loading"
            label="Sign in"
          />
        </form>
      </UCard>
    </div>
  </div>
</template>
