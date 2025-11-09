import type { ShallowRef } from 'vue'
import type { GeoJSON } from '~/types'
import { bbox as calculateBBox } from '@turf/turf'

export function addReactiveSource(map: mapboxgl.Map, sourceId: string, source: ShallowRef<GeoJSON | null>) {
  const emptyCollection: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }
  let lastData: GeoJSON = emptyCollection

  map.on('load', () => {
    watch(source, (newSource) => {
      const data = newSource ?? emptyCollection
      lastData = data
      const mapSource = map.getSource(sourceId) as mapboxgl.GeoJSONSource | undefined
      if (!mapSource) {
        map.addSource(sourceId, { type: 'geojson', data })
      } else {
        mapSource.setData(data)
      }
    }, { immediate: true })
  })

  function zoom(options: mapboxgl.FitBoundsOptions = { padding: 40 }) {
    const source = map.getSource(sourceId) as mapboxgl.GeoJSONSource | undefined
    const data = source ? (source as any)._data ?? lastData : lastData
    if (!data)
      return

    const bbox = calculateBBox(data as any)
    if (!bbox || bbox.some(v => !Number.isFinite(v)))
      return

    map.fitBounds(bbox as any, options)
  }

  return { zoom }
}

export function addReactiveLayer(
  map: mapboxgl.Map,
  layer: mapboxgl.AnyLayer,
  { visible = true, before}: {
    before?: string
    visible?: MaybeRef<boolean>
  } = {},
) {
  const _visible = toRef(visible)

  map.on('load', () => {
    map.addLayer(layer, before)

    watch(_visible, (isVisible) => {
      trySetVisibility(map, layer.id, isVisible)
    }, { immediate: true })
  })

  return { visible: _visible }
}

function trySetVisibility(map: mapboxgl.Map, layerIds: string | string[], isVisible: boolean) {
  const visibility = isVisible ? 'visible' : 'none'
  const ids = Array.isArray(layerIds) ? layerIds : [layerIds]
  for (const id of ids) {
    if (map.getLayer(id)) {
      map.setLayoutProperty(id, 'visibility', visibility)
    }
  }
}

function tryRemoveLayer(map: mapboxgl.Map, layerIds: string | string[]) {
  const ids = Array.isArray(layerIds) ? layerIds : [layerIds]
  for (const id of ids) {
    if (map.getLayer(id)) {
      map.removeLayer(id)
    }
  }
}

function tryRemoveSource(map: mapboxgl.Map, sourceIds: string | string[]) {
  const ids = Array.isArray(sourceIds) ? sourceIds : [sourceIds]
  for (const id of ids) {
    if (map.getSource(id)) {
      map.removeSource(id)
    }
  }
}
