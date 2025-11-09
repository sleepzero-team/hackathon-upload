import type mapboxgl from 'mapbox-gl'
import type { Ref } from 'vue'
import type { GeoJSON } from '~/types'

const EMPTY_FEATURE_COLLECTION: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }
const TOILET_SOURCE_ID = 'public-toilets'
const TOILET_LAYER_ID = 'public-toilets-layer'
const TOILET_ICON_ID = 'public-toilet-icon'
const TOILET_ICON_SIZE = 2.0
const toiletGeoAssetUrl = new URL('../assets/geos/toliet.geojson', import.meta.url).href
const toiletIconAssetUrl = new URL('../assets/images/geo-toilet.png', import.meta.url).href

let toiletGeoPromise: Promise<GeoJSON.FeatureCollection> | null = null
let toiletIconPromise: Promise<HTMLImageElement> | null = null

export function useMapToilets(
  map: mapboxgl.Map,
  { visible = false }: { visible?: MaybeRef<boolean> } = {},
) {
  const _visible = toRef(visible)

  map.on('load', () => {
    void initializeLayer(map, _visible)
  })

  watch(_visible, (isVisible) => {
    if (!map.getLayer(TOILET_LAYER_ID))
      return
    map.setLayoutProperty(TOILET_LAYER_ID, 'visibility', isVisible ? 'visible' : 'none')
  }, { immediate: true })
}

async function initializeLayer(map: mapboxgl.Map, visible: Ref<boolean>) {
  try {
    const data = await loadToiletGeoJSON()
    if (map.getLayer(TOILET_LAYER_ID))
      map.removeLayer(TOILET_LAYER_ID)
    if (map.getSource(TOILET_SOURCE_ID))
      map.removeSource(TOILET_SOURCE_ID)

    map.addSource(TOILET_SOURCE_ID, {
      type: 'geojson',
      data,
    })

    await ensureToiletIcon(map)

    map.addLayer({
      id: TOILET_LAYER_ID,
      type: 'symbol',
      source: TOILET_SOURCE_ID,
      layout: {
        'icon-image': TOILET_ICON_ID,
        'icon-size': [
          'interpolate',
          ['linear'],
          ['zoom'],
          12,
          0.44 * TOILET_ICON_SIZE,
          16,
          0.7 * TOILET_ICON_SIZE,
          19,
          1 * TOILET_ICON_SIZE,
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
    console.error('[useMapToilets] Failed to initialize', error)
  }
}

async function ensureToiletIcon(map: mapboxgl.Map) {
  if (!import.meta.client)
    return

  if (map.hasImage(TOILET_ICON_ID))
    return

  toiletIconPromise ??= loadImageAsset(toiletIconAssetUrl)
  const imageElement = await toiletIconPromise

  if (map.hasImage(TOILET_ICON_ID))
    return

  const pixelRatio = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1
  map.addImage(TOILET_ICON_ID, imageElement, { pixelRatio })
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

async function loadToiletGeoJSON() {
  if (!import.meta.client)
    return EMPTY_FEATURE_COLLECTION

  if (!toiletGeoPromise) {
    toiletGeoPromise = fetch(toiletGeoAssetUrl)
      .then(async (response) => {
        if (!response.ok)
          throw new Error(`Failed to load toilets geojson: ${response.status}`)
        return response.json() as Promise<GeoJSON.FeatureCollection>
      })
      .catch((error) => {
        toiletGeoPromise = null
        throw error
      })
  }

  return toiletGeoPromise
}
