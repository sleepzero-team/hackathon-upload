import type { Fn } from '@vueuse/core'
import { useScriptTag } from '@vueuse/core'

let googleMapsPromise: Promise<typeof google.maps> | null = null

interface GooglePlacesClients {
  maps: typeof google.maps
  autocomplete: google.maps.places.AutocompleteService
  places: google.maps.places.PlacesService
}

function buildPlacesScriptUrl(apiKey: string): string {
  const params = new URLSearchParams({
    key: apiKey,
    libraries: 'places',
    language: 'zh-TW',
  })

  return `https://maps.googleapis.com/maps/api/js?${params.toString()}`
}

export function useGooglePlacesApi(): Promise<typeof google.maps> {
  const runtimeConfig = useRuntimeConfig()
  const apiKey = runtimeConfig.public.googleMapsApiKey

  if (!apiKey)
    return Promise.reject(new Error('Missing Google Maps API key. Set runtimeConfig.public.googleMapsApiKey.'))

  if (typeof window === 'undefined')
    return Promise.reject(new Error('Google Maps API is only available in the browser.'))

  if (window.google?.maps?.places)
    return Promise.resolve(window.google.maps)

  if (!googleMapsPromise) {
    googleMapsPromise = new Promise((resolve, reject) => {
      let stop: Fn | undefined

      const { load, unload } = useScriptTag(
        buildPlacesScriptUrl(apiKey),
        () => {
          if (window.google?.maps?.places) {
            resolve(window.google.maps)
          } else {
            googleMapsPromise = null
            stop?.()
            reject(new Error('Google Maps API loaded but window.google.maps is unavailable.'))
          }
        },
        {
          manual: true,
          attrs: {
            async: '',
            defer: '',
          },
        },
      )

      stop = unload

      load().catch((error) => {
        googleMapsPromise = null
        stop?.()
        reject(error)
      })
    })
  }

  return googleMapsPromise
}

export async function createGooglePlacesClients(): Promise<GooglePlacesClients> {
  const maps = await useGooglePlacesApi()
  return {
    maps,
    autocomplete: new maps.places.AutocompleteService(),
    places: new maps.places.PlacesService(document.createElement('div')),
  }
}
