export default defineNuxtPlugin((nuxtApp) => {
  // const { session } = useUserSession()

  const api = $fetch.create({
    baseURL: 'https://hackathon.tianci-cloudflare.com',
    onRequest({ request, options, error }) {
      // if (session.value?.token) {
      //   // note that this relies on ofetch >= 1.4.0 - you may need to refresh your lockfile
      //   options.headers.set('Authorization', `Bearer ${session.value?.token}`)
      // }
    },
  })

  return {
    provide: { api },
  }
})
