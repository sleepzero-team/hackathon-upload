import type { GeoJSON, ShadowRouteCollection } from '~/types'
import mapboxgl from 'mapbox-gl'
import { COLOR_HEX_PRIMARY } from '~/utils/constants'
import { geoJSONFromRouteData, geoJSONOriginConnectors } from '~/utils/geo'
import { addReactiveLayer, addReactiveSource } from '~/utils/mapbox'

interface PlayerMarkerSprite {
  src: string
  width: number
  height: number
}

const DEFAULT_PLAYER_MARKER_SPRITE: PlayerMarkerSprite = {
  src: new URL('../assets/images/bat-64.png', import.meta.url).href,
  width: 64,
  height: 57,
}
const PLAYER_IDLE_TIMEOUT_MS = 400
const PLAYER_IDLE_POLL_INTERVAL_MS = 200
const PLAYER_FLIP_ANIMATION_SUSPEND_MS = 100

type PlayerFacingDirection = 'left' | 'right'

export function useMapPlayer(
  map: mapboxgl.Map,
  position: MaybeRef<mapboxgl.LngLatLike>,
  options: { sprite?: MaybeRef<PlayerMarkerSprite> } = {},
) {
  let playerMarker: mapboxgl.Marker | null = null
  let markerRootEl: HTMLDivElement | null = null
  let markerSpriteEl: HTMLImageElement | null = null
  const _position = toRef(position)
  let lastMovementAt = Date.now()
  let isPlayerIdle = false
  let playerFacing: PlayerFacingDirection = 'left'
  let flipAnimationResetTimer: number | null = null
  const spriteRef = options.sprite ? toRef(options.sprite) : ref(DEFAULT_PLAYER_MARKER_SPRITE)

  function ensurePlayerMarker() {
    playerMarker?.setLngLat(_position.value)
  }

  function updateMarkerIdleState() {
    if (markerRootEl)
      markerRootEl.dataset.playerIdle = isPlayerIdle ? 'true' : 'false'
  }

  function markPlayerActive() {
    lastMovementAt = Date.now()
    if (isPlayerIdle) {
      isPlayerIdle = false
      updateMarkerIdleState()
    }
  }

  function updateMarkerFacingState() {
    if (markerRootEl)
      markerRootEl.dataset.playerFacing = playerFacing
  }

  function applySprite(sprite: PlayerMarkerSprite | null | undefined) {
    if (!markerSpriteEl || !sprite)
      return

    markerSpriteEl.src = sprite.src
    markerSpriteEl.style.width = `${sprite.width}px`
    markerSpriteEl.style.height = `${sprite.height}px`
  }

  function suspendIdleAnimationDuringFlip() {
    if (!markerRootEl)
      return

    markerRootEl.dataset.playerFlipping = 'true'

    if (typeof window === 'undefined') {
      markerRootEl.dataset.playerFlipping = 'false'
      return
    }

    if (flipAnimationResetTimer !== null)
      window.clearTimeout(flipAnimationResetTimer)

    flipAnimationResetTimer = window.setTimeout(() => {
      if (markerRootEl)
        markerRootEl.dataset.playerFlipping = 'false'
      flipAnimationResetTimer = null
    }, PLAYER_FLIP_ANIMATION_SUSPEND_MS)
  }

  function positionsEqual(
    nextPosition: mapboxgl.LngLatLike | undefined,
    previousPosition: mapboxgl.LngLatLike | undefined,
  ) {
    if (!nextPosition || !previousPosition)
      return false

    const next = mapboxgl.LngLat.convert(nextPosition)
    const prev = mapboxgl.LngLat.convert(previousPosition)
    return next.lng === prev.lng && next.lat === prev.lat
  }

  function updateFacingDirection(
    nextPosition: mapboxgl.LngLatLike | undefined,
    previousPosition: mapboxgl.LngLatLike | undefined,
  ) {
    if (!nextPosition || !previousPosition)
      return

    const next = mapboxgl.LngLat.convert(nextPosition)
    const prev = mapboxgl.LngLat.convert(previousPosition)
    const deltaLng = next.lng - prev.lng
    if (deltaLng === 0)
      return

    const nextFacing: PlayerFacingDirection = deltaLng > 0 ? 'right' : 'left'
    if (nextFacing !== playerFacing) {
      playerFacing = nextFacing
      updateMarkerFacingState()
      suspendIdleAnimationDuringFlip()
    }
  }

  useIntervalFn(() => {
    if (isPlayerIdle)
      return

    const idleFor = Date.now() - lastMovementAt
    if (idleFor >= PLAYER_IDLE_TIMEOUT_MS) {
      isPlayerIdle = true
      updateMarkerIdleState()
    }
  }, PLAYER_IDLE_POLL_INTERVAL_MS, { immediate: true })

  map.on('load', () => {
    markerRootEl = document.createElement('div')
    markerRootEl.className = 'map-player-marker'
    markerRootEl.dataset.playerIdle = 'false'
    markerRootEl.dataset.playerFacing = playerFacing
    markerRootEl.dataset.playerFlipping = 'false'
    markerRootEl.style.pointerEvents = 'none'
    markerRootEl.style.userSelect = 'none'

    const markerSpriteWrapperEl = document.createElement('div')
    markerSpriteWrapperEl.className = 'map-player-marker__sprite-wrapper'

    markerSpriteEl = document.createElement('img')
    markerSpriteEl.alt = 'Player location'
    markerSpriteEl.className = 'map-player-marker__sprite'
    markerSpriteWrapperEl.appendChild(markerSpriteEl)
    markerRootEl.appendChild(markerSpriteWrapperEl)
    applySprite(spriteRef.value)

    playerMarker = new mapboxgl.Marker({
      element: markerRootEl,
      anchor: 'bottom',
    }).setLngLat(_position.value).addTo(map)
    updateMarkerIdleState()
    ensurePlayerMarker()
  })

  watch(_position, (newPosition, previousPosition) => {
    ensurePlayerMarker()
    if (positionsEqual(newPosition, previousPosition))
      return

    updateFacingDirection(newPosition, previousPosition)
    markPlayerActive()
  }, { immediate: true })

  watch(spriteRef, (newSprite) => {
    applySprite(newSprite)
  }, { immediate: true })
}

/** unused */
export function useMapBuildings(map: mapboxgl.Map) {
  map.on('style.load', () => {
    // Insert the layer beneath any symbol layer.
    const layers = map.getStyle().layers
    const labelLayerId = layers.find(
      layer => layer.type === 'symbol' && layer.layout?.['text-field'],
    )?.id

    // The 'building' layer in the Mapbox Streets
    // vector tileset contains building height data
    // from OpenStreetMap.
    map.addLayer(
      {
        'id': 'add-3d-buildings',
        'source': 'composite',
        'source-layer': 'building',
        'filter': ['==', 'extrude', 'true'],
        'type': 'fill-extrusion',
        'minzoom': 15,
        'paint': {
          'fill-extrusion-color': '#aaa',

          // Use an 'interpolate' expression to
          // add a smooth transition effect to
          // the buildings as the user zooms in.
          'fill-extrusion-height': [
            'interpolate',
            ['linear'],
            ['zoom'],
            15,
            0,
            15.05,
            ['get', 'height'],
          ],
          'fill-extrusion-base': [
            'interpolate',
            ['linear'],
            ['zoom'],
            15,
            0,
            15.05,
            ['get', 'min_height'],
          ],
          'fill-extrusion-opacity': 0.6,
        },
      },
      labelLayerId,
    )
  })
}

export function useGeoShadows(map: mapboxgl.Map, geoJSON: MaybeRef<GeoJSON | null> = null) {
  const $geoJSON = toRef(geoJSON)
  const ID_SOURCE = 'shadow-source'
  const { zoom } = addReactiveSource(map, ID_SOURCE, $geoJSON)

  const ID_LAYER_FILL = 'shadow-fill'
  const ID_LAYER_OUTLINE = 'shadow-outline'

  addReactiveLayer(map, {
    id: ID_LAYER_FILL,
    type: 'fill',
    source: ID_SOURCE,
    paint: {
      'fill-color': '#ff6600',
      'fill-opacity': 0.4,
    },
  }, { before: '3d-buildings' })

  addReactiveLayer(map, {
    id: ID_LAYER_OUTLINE,
    type: 'line',
    source: ID_SOURCE,
    paint: {
      'line-color': '#ff6600',
      'line-width': 2,
    },
  }, { before: ID_LAYER_FILL })

  return { zoom }
}

export function useGeoRoutes(
  map: mapboxgl.Map,
  routeData: MaybeRef<ShadowRouteCollection | null> = null,
  options: {
    selectedRouteId?: MaybeRef<string | null | undefined>
  } = {},
) {
  const $routeData = toRef(routeData)
  const selectedRouteId = options.selectedRouteId ? toRef(options.selectedRouteId) : ref<string | null>(null)
  const ID_SOURCE = 'routes'
  const geoJSON = computed<GeoJSON | null>(() => $routeData.value ? geoJSONFromRouteData($routeData.value) : null)

  const { zoom } = addReactiveSource(map, ID_SOURCE, geoJSON)
  const ID_SOURCE_CONNECTORS = 'route-origin-connectors'
  const connectorGeoJSON = computed<GeoJSON | null>(() => $routeData.value ? geoJSONOriginConnectors($routeData.value) : null)
  addReactiveSource(map, ID_SOURCE_CONNECTORS, connectorGeoJSON)

  const ID_ROUTES_BASE = 'routes-base'
  const ID_ROUTE_SELECTED = 'route-selected'
  const ID_ROUTE_CONNECTORS = 'route-origin-connectors'

  addReactiveLayer(map, {
    id: ID_ROUTE_CONNECTORS,
    type: 'line',
    source: ID_SOURCE_CONNECTORS,
    layout: {
      'line-cap': 'round',
      'line-join': 'round',
    },
    paint: {
      'line-width': 8,
      'line-color': COLOR_HEX_PRIMARY,
      'line-opacity': 0.7,
      'line-dasharray': [0.25, 2],
    },
  })

  addReactiveLayer(map, {
    id: ID_ROUTES_BASE,
    type: 'line',
    source: ID_SOURCE,
    layout: {
      'line-cap': 'round',
      'line-join': 'round',
    },
    paint: {
      'line-width': 5,
      'line-color': '#6b7280',
      'line-opacity': 0.7,
    },
  })

  addReactiveLayer(map, {
    id: ID_ROUTE_SELECTED,
    type: 'line',
    source: ID_SOURCE,
    filter: ['==', ['get', 'route_id'], '__route_selected_none__'],
    layout: {
      'line-cap': 'round',
      'line-join': 'round',
    },
    paint: {
      'line-width': 8,
      'line-color': COLOR_HEX_PRIMARY,
      'line-opacity': 0.95,
    },
  })

  // TODO: reactive marker
  map.on('load', () => {
    let originMarker: mapboxgl.Marker | undefined
    let destinationMarker: mapboxgl.Marker | undefined

    watch($routeData, (newRouteData) => {
      if (!newRouteData) {
        originMarker?.remove()
        destinationMarker?.remove()
      } else {
        const { origin, destination } = newRouteData

        if (!originMarker) {
          originMarker = new mapboxgl.Marker({ color: '#2ecc71' })
            .setLngLat([origin.lng, origin.lat])
            .setPopup(new mapboxgl.Popup().setText('起點'))
            .addTo(map)
        } else {
          originMarker
            .setLngLat([origin.lng, origin.lat])
            .addTo(map)
        }

        if (!destinationMarker) {
          destinationMarker = new mapboxgl.Marker({ color: '#e74c3c' })
            .setLngLat([destination.lng, destination.lat])
            .setPopup(new mapboxgl.Popup().setText('終點'))
            .addTo(map)
        } else {
          destinationMarker
            .setLngLat([destination.lng, destination.lat])
            .addTo(map)
        }
      }
    }, { immediate: true })

    watch(selectedRouteId, (routeId) => {
      const layerId = ID_ROUTE_SELECTED
      if (!map.getLayer(layerId))
        return

      const filterValue = routeId ?? '__route_selected_none__'
      map.setFilter(layerId, ['==', ['get', 'route_id'], filterValue])
      const visibility = routeId ? 'visible' : 'none'
      map.setLayoutProperty(layerId, 'visibility', visibility)
    }, { immediate: true })
  })

  return {
    zoom,
  }
}
