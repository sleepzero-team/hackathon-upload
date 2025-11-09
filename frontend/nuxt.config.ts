// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: [
    '@nuxt/ui',
    '@vueuse/nuxt',
  ],
  css: ['~/assets/css/main.css'],
  imports: {
    // disable auto import for AI friendly
    scan: false,

    // disable auto import for vue/nuxt/modules
    // autoImport: false
  },
  // disable components auto import
  // components: { dirs: [] },
  app: {
    head: {
      title: '漫步吸血鬼',
      meta: [
        {
          name: 'viewport',
          content: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover',
        },
      ],
    },
  },
  ssr: false,
  runtimeConfig: {
    public: {
      mapboxAccessToken: '',
      googleMapsApiKey: '',
    },
  },
  typescript: {
    typeCheck: 'build',
    tsConfig: {
      compilerOptions: {
        noUncheckedIndexedAccess: false,
        types: ['google.maps'],
      },
    },
  },
  ui: {
    colorMode: false,
  },
  vite: {
    server: {
      allowedHosts: [
        '.trycloudflare.com',
      ],
    },
  },
})
