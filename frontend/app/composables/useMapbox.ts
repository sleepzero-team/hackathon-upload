import { createHooks } from 'hookable'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'

interface UseMapboxOptions {
  accessToken?: string
  options?: Partial<mapboxgl.MapboxOptions>
}

export function useMapbox(mapContainer: Ref<HTMLElement | null>, { accessToken, options }: UseMapboxOptions = {}) {
  const _map = shallowRef<mapboxgl.Map>()
  const hooks = createHooks<{
    init: (map: mapboxgl.Map) => void
    load: (map: mapboxgl.Map) => void
  }>()

  onMounted(() => {
    if (mapContainer.value) {
      if (!mapboxgl.accessToken && accessToken)
        mapboxgl.accessToken = accessToken

      const map = new mapboxgl.Map({
        container: mapContainer.value,
        ...options,
      })

      _map.value = map

      hooks.callHook('init', map)

      map.on('load', () => {
        hooks.callHook('load', map)
      })

      map.on('error', (e) => {
        console.error('Mapbox init error:', e.error)
      })
    }
  })

  onBeforeUnmount(() => {
    _map.value?.remove()
  })

  return { map: _map, hooks }
}
