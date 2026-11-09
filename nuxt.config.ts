// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@vueuse/nuxt'
  ],

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    databaseUrl: process.env.DATABASE_URL || 'file:./.data/wgcontrol.sqlite',
    adminUsername: process.env.WGCONTROL_ADMIN_USER || 'admin',
    adminPassword: process.env.WGCONTROL_ADMIN_PASSWORD || 'changeme',
    public: {
      siteUrl: process.env.NUXT_PUBLIC_SITE_URL || ''
    }
  },

  // Bind locally by default for admin safety
  devServer: {
    host: process.env.NUXT_HOST || '127.0.0.1',
    port: Number(process.env.NUXT_PORT || 3000)
  },

  compatibilityDate: '2026-06-30',

  nitro: {
    experimental: {
      tasks: true
    }
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  }
})
