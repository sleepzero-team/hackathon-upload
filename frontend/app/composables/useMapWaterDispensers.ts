import type mapboxgl from 'mapbox-gl'
import type { Ref } from 'vue'
import type { GeoJSON } from '~/types'

const EMPTY_FEATURE_COLLECTION: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }
const WATER_SOURCE_ID = 'water-dispensers'
const WATER_LAYER_ID = 'water-dispensers-layer'
const WATER_ICON_ID = 'water-dispenser-icon'
const WATER_ICON_SIZE = 2.0
const waterGeoAssetUrl = new URL('../assets/geos/water_dispenser.geojson', import.meta.url).href
const waterIconAssetUrl = new URL('../assets/images/geo-water_dispenser.png', import.meta.url).href

let waterGeoPromise: Promise<GeoJSON.FeatureCollection> | null = null
let waterIconPromise: Promise<HTMLImageElement> | null = null

export function useMapWaterDispensers(
  map: mapboxgl.Map,
  { visible = false }: { visible?: MaybeRef<boolean> } = {},
) {
  const _visible = toRef(visible)

  map.on('load', () => {
    void initializeLayer(map, _visible)
  })

  watch(_visible, (isVisible) => {
    if (!map.getLayer(WATER_LAYER_ID))
      return
    map.setLayoutProperty(WATER_LAYER_ID, 'visibility', isVisible ? 'visible' : 'none')
  }, { immediate: true })
}

async function initializeLayer(map: mapboxgl.Map, visible: Ref<boolean>) {
  try {
    const data = await loadWaterDispenserGeoJSON()

    if (map.getLayer(WATER_LAYER_ID))
      map.removeLayer(WATER_LAYER_ID)
    if (map.getSource(WATER_SOURCE_ID))
      map.removeSource(WATER_SOURCE_ID)

    map.addSource(WATER_SOURCE_ID, {
      type: 'geojson',
      data,
    })

    await ensureWaterDispenserIcon(map)

    map.addLayer({
      id: WATER_LAYER_ID,
      type: 'symbol',
      source: WATER_SOURCE_ID,
      layout: {
        'icon-image': WATER_ICON_ID,
        'icon-size': [
          'interpolate',
          ['linear'],
          ['zoom'],
          12,
          0.44 * WATER_ICON_SIZE,
          16,
          0.7 * WATER_ICON_SIZE,
          19,
          1 * WATER_ICON_SIZE,
        ],
        'icon-anchor': 'bottom',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        'visibility': visible.value ? 'visible' : 'none',
      },
      paint: {
        'icon-opacity': 0.95,
      },
    })
  } catch (error) {
    console.error('[useMapWaterDispensers] Failed to initialize', error)
  }
}

async function ensureWaterDispenserIcon(map: mapboxgl.Map) {
  if (!import.meta.client)
    return

  if (map.hasImage(WATER_ICON_ID))
    return

  waterIconPromise ??= loadImageAsset(waterIconAssetUrl)
  const imageElement = await waterIconPromise

  if (map.hasImage(WATER_ICON_ID))
    return

  const pixelRatio = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1
  map.addImage(WATER_ICON_ID, imageElement, { pixelRatio })
}

function loadImageAsset(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    if (!import.meta.client) {
      reject(new Error('loadImageAsset available only in browser'))
      return
    }

    const image = new Image()
    image.decoding = 'async'
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Failed to load image asset from ${url}`))
    image.src = url
  })
}

async function loadWaterDispenserGeoJSON() {
  if (!import.meta.client)
    return EMPTY_FEATURE_COLLECTION

  if (!waterGeoPromise) {
    waterGeoPromise = fetch(waterGeoAssetUrl)
      .then(async (response) => {
        if (!response.ok)
          throw new Error(`Failed to load water dispenser geojson: ${response.status}`)
        return response.json() as Promise<GeoJSON.FeatureCollection>
      })
      .catch((error) => {
        waterGeoPromise = null
        throw error
      })
  }

  return waterGeoPromise
}
