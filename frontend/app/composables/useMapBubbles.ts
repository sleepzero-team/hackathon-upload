import type { ShallowRef, WatchStopHandle } from 'vue'
import type { GeoJSON, GeoLocationLngLat } from '~/types'
import { along, bbox as calculateBBox, length as lineLength, lineString, distance as turfDistance, point as turfPoint } from '@turf/turf'
import { useVisitedPositionsStore } from '~/stores/useVisitedPositions'
import { addReactiveSource } from '~/utils/mapbox'

const WALKABLE_ROAD_CLASSES = ['path', 'pedestrian', 'footway', 'sidewalk', 'steps', 'track']
const FOOT_IN_METERS = 0.3048
const AVERAGE_STEP_LENGTH_FEET = 2.5
const STEPS_PER_BUBBLE = 40
const BUBBLE_SPACING_METERS = FOOT_IN_METERS * AVERAGE_STEP_LENGTH_FEET * STEPS_PER_BUBBLE
const BUBBLE_GENERATION_RADIUS_METERS = 500
const BUBBLE_COLLECTION_RADIUS_METERS = 20
const BUBBLE_MAX_COUNT = 220
const BUBBLE_MIN_DISTANCE_METERS = BUBBLE_SPACING_METERS * 0.6
const VISITED_TRACK_SAMPLE_SPACING_METERS = BUBBLE_MIN_DISTANCE_METERS * 0.5
const VISITED_EXCLUSION_RADIUS_METERS = BUBBLE_MIN_DISTANCE_METERS
const BUBBLE_ICON_ID = 'pacman-bubble-icon'
const BUBBLE_ICON_SIZE_MULTIPLIER = 4
const bubbleIconAssetUrl = new URL('../assets/images/bubble-icon.svg', import.meta.url).href
let bubbleIconImagePromise: Promise<HTMLImageElement> | null = null

interface BubbleProperties {
  id: string
}

type BubbleFeature = GeoJSON.Feature<GeoJSON.Point, BubbleProperties>
type Bounds = [number, number, number, number]
interface VisitedTrackPoint {
  coords: GeoLocationLngLat
  turf: GeoJSON.Feature<GeoJSON.Point>
}

export interface PacmanBubbleOptions {
  playerPosition: MaybeRef<GeoLocationLngLat>
  generationRadiusMeters?: number
  collectionRadiusMeters?: number
  onCollect?: (count: number) => void
  enabled?: MaybeRef<boolean>
}

export function useMapBubbles(
  map: mapboxgl.Map,
  {
    playerPosition,
    generationRadiusMeters = BUBBLE_GENERATION_RADIUS_METERS,
    collectionRadiusMeters = BUBBLE_COLLECTION_RADIUS_METERS,
    onCollect,
    enabled = true,
  }: PacmanBubbleOptions,
) {
  const _playerPosition = toRef(playerPosition)
  const _enabled = toRef(enabled)

  const bubbleFeatures = shallowRef<GeoJSON.FeatureCollection<GeoJSON.Point>>(createEmptyFeatureCollection())

  const collectedBubbleIds = new Set<string>()
  const collectedCount = ref(0)
  const lastGenerationOrigin = shallowRef<GeoLocationLngLat | null>(null)
  const isMapReady = ref(map.isStyleLoaded())
  const { visitedPositions, addVisitedPosition } = useVisitedPositionsStore()
  const visitedTrack = shallowRef<VisitedTrackPoint[]>([])

  const BUBBLE_SOURCE_ID = 'pacman-bubbles'
  const BUBBLE_LAYER_ID = 'pacman-bubbles-layer'
  let bubbleLayerInitialized = false
  let stopBubbleVisibilityWatch: WatchStopHandle | null = null

  const scheduleBubbleRefresh = useThrottleFn(() => {
    if (!isMapReady.value || !_playerPosition.value || !_enabled.value)
      return

    const newFeatures = generateBubblesAround(
      map,
      _playerPosition.value,
      generationRadiusMeters,
      collectedBubbleIds,
      visitedTrack.value,
    )

    bubbleFeatures.value = {
      type: 'FeatureCollection',
      features: newFeatures,
    }

    lastGenerationOrigin.value = [..._playerPosition.value] as GeoLocationLngLat
  }, 500, true)

  addReactiveSource(map, BUBBLE_SOURCE_ID, bubbleFeatures as ShallowRef<GeoJSON | null>)

  const initializeBubbleLayer = async () => {
    if (bubbleLayerInitialized)
      return

    try {
      await ensureBubbleIcon(map)

      if (map.getLayer(BUBBLE_LAYER_ID))
        map.removeLayer(BUBBLE_LAYER_ID)

      map.addLayer({
        id: BUBBLE_LAYER_ID,
        type: 'symbol',
        source: BUBBLE_SOURCE_ID,
        layout: {
          'icon-image': BUBBLE_ICON_ID,
          'icon-size': [
            'interpolate',
            ['linear'],
            ['zoom'],
            12,
            0.28 * BUBBLE_ICON_SIZE_MULTIPLIER,
            16,
            0.42 * BUBBLE_ICON_SIZE_MULTIPLIER,
            18,
            0.58 * BUBBLE_ICON_SIZE_MULTIPLIER,
          ],
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
          'icon-anchor': 'center',
          'visibility': 'visible',
        },
        paint: {
          'icon-opacity': 0.92,
        },
      }, '3d-buildings')

      stopBubbleVisibilityWatch?.()
      stopBubbleVisibilityWatch = watch(_enabled, (isVisible) => {
        if (!map.getLayer(BUBBLE_LAYER_ID))
          return
        map.setLayoutProperty(BUBBLE_LAYER_ID, 'visibility', isVisible ? 'visible' : 'none')
      }, { immediate: true })

      bubbleLayerInitialized = true
    } catch (error) {
      console.error('[useMapBubbles] Failed to initialize bubble layer', error)
    }
  }

  map.on('load', () => {
    isMapReady.value = true
    void initializeBubbleLayer()

    scheduleBubbleRefresh()
  })

  watch(_enabled, (enabled) => {
    if (enabled)
      scheduleBubbleRefresh()
  }, { immediate: true })

  watch(visitedPositions, (positions) => {
    visitedTrack.value = positions.map(entry => ({
      coords: [...entry.coords] as GeoLocationLngLat,
      turf: turfPoint(entry.coords),
    }))
  }, { immediate: true, deep: true })

  watch(_playerPosition, (position) => {
    if (!position)
      return

    if (_enabled.value)
      recordVisitedPosition(position)

    if (!isMapReady.value || !_enabled.value)
      return

    collectNearbyBubbles(position, collectionRadiusMeters)

    if (needsRegeneration(position, generationRadiusMeters))
      scheduleBubbleRefresh()
  }, { immediate: true })

  function needsRegeneration(position: GeoLocationLngLat, radius: number) {
    if (!lastGenerationOrigin.value)
      return true

    const moved = turfDistance(
      turfPoint(position),
      turfPoint(lastGenerationOrigin.value),
      { units: 'meters' },
    )

    return moved >= radius * 0.35
  }

  function collectNearbyBubbles(position: GeoLocationLngLat, radius: number) {
    if (!bubbleFeatures.value.features.length || !_enabled.value)
      return

    const playerPoint = turfPoint(position)
    const remaining: BubbleFeature[] = []
    let collectedThisStep = 0

    for (const feature of bubbleFeatures.value.features as BubbleFeature[]) {
      const distanceToPlayer = turfDistance(playerPoint, feature, { units: 'meters' })
      if (distanceToPlayer <= radius) {
        const [bubbleLng, bubbleLat] = feature.geometry.coordinates
        const bubbleCoordinates: GeoLocationLngLat = [bubbleLng, bubbleLat]
        const bubbleId = feature.properties?.id ?? createBubbleId(bubbleCoordinates)
        collectedBubbleIds.add(bubbleId)
        collectedThisStep++
        continue
      }
      remaining.push(feature)
    }

    if (!collectedThisStep)
      return

    bubbleFeatures.value = {
      type: 'FeatureCollection',
      features: remaining,
    }
    collectedCount.value += collectedThisStep
    onCollect?.(collectedThisStep)
  }

  function recordVisitedPosition(position: GeoLocationLngLat) {
    const coords = [...position] as GeoLocationLngLat
    const newPoint = turfPoint(coords)
    const last = visitedTrack.value[visitedTrack.value.length - 1]

    if (last) {
      const distanceFromLast = turfDistance(newPoint, last.turf, { units: 'meters' })
      if (distanceFromLast < VISITED_TRACK_SAMPLE_SPACING_METERS)
        return
    }

    addVisitedPosition(coords)
  }

  return {
    bubbles: bubbleFeatures,
    collectedCount,
    refresh: scheduleBubbleRefresh,
  }
}

function createEmptyFeatureCollection(): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: 'FeatureCollection',
    features: [],
  }
}

function generateBubblesAround(
  map: mapboxgl.Map,
  center: GeoLocationLngLat,
  radiusMeters: number,
  collectedBubbleIds: Set<string>,
  visitedTrack: VisitedTrackPoint[],
) {
  const bounds = buildBoundsFromRadius(center, radiusMeters)
  const centerPoint = turfPoint(center)
  const walkableFeatures = queryWalkableRoadSegments(map, bounds)
  const newBubbles: BubbleFeature[] = []
  const seenBubbleIds = new Set<string>()

  for (const feature of walkableFeatures) {
    const geometries = unwrapLineGeometries(feature.geometry as GeoJSON.Geometry)

    for (const coords of geometries) {
      if (coords.length < 2)
        continue

      const line = lineString(coords)
      const lineBounds = calculateBBox(line) as Bounds

      if (!bboxIntersects(lineBounds, bounds))
        continue

      const lineLengthMeters = lineLength(line, { units: 'meters' })
      if (lineLengthMeters < BUBBLE_SPACING_METERS)
        continue

      const cursorOffset = deterministicOffsetForLine(coords, BUBBLE_SPACING_METERS)
      let cursor = cursorOffset

      while (cursor < lineLengthMeters) {
        const bubblePoint = along(line, cursor, { units: 'meters' })
        const [lng, lat] = bubblePoint.geometry.coordinates
        const bubbleId = createBubbleId([lng, lat])

        if (
          collectedBubbleIds.has(bubbleId) ||
          seenBubbleIds.has(bubbleId) ||
          !isPointInsideBounds([lng, lat], bounds)
        ) {
          cursor += BUBBLE_SPACING_METERS
          continue
        }

        const distanceToCenter = turfDistance(centerPoint, bubblePoint, { units: 'meters' })
        if (distanceToCenter > radiusMeters) {
          cursor += BUBBLE_SPACING_METERS
          continue
        }

        const candidatePoint: GeoLocationLngLat = [lng, lat]

        if (!hasMinimumSpacing(candidatePoint, newBubbles, BUBBLE_MIN_DISTANCE_METERS)) {
          cursor += BUBBLE_SPACING_METERS
          continue
        }

        if (isVisitedPoint(candidatePoint, visitedTrack)) {
          cursor += BUBBLE_SPACING_METERS
          continue
        }

        newBubbles.push({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: candidatePoint,
          },
          properties: {
            id: bubbleId,
          },
        })

        seenBubbleIds.add(bubbleId)

        if (newBubbles.length >= BUBBLE_MAX_COUNT)
          return newBubbles

        cursor += BUBBLE_SPACING_METERS
      }
    }
  }

  return newBubbles
}

function queryWalkableRoadSegments(map: mapboxgl.Map, bounds: Bounds) {
  const rawFeatures = map.querySourceFeatures('composite', {
    sourceLayer: 'road',
    filter: ['in', 'class', ...WALKABLE_ROAD_CLASSES],
  })

  const deduplicated: Array<{ feature: mapboxgl.MapboxGeoJSONFeature, key: string }> = []
  const seen = new Set<string>()

  for (const feature of rawFeatures) {
    if (!feature.geometry)
      continue

    const geometryType = feature.geometry.type
    if (geometryType !== 'LineString' && geometryType !== 'MultiLineString')
      continue

    const key = [
      feature.source,
      feature.sourceLayer,
      feature.id ?? feature.properties?.mapbox_streets_v8_id ?? feature.properties?.osm_id,
    ].filter(Boolean).join(':')

    if (!key || seen.has(key))
      continue

    seen.add(key)

    const featureBounds = calculateBBox(feature as unknown as GeoJSON.Feature) as Bounds
    if (!bboxIntersects(featureBounds, bounds))
      continue

    deduplicated.push({ feature, key })
  }

  deduplicated.sort((a, b) => a.key.localeCompare(b.key))

  return deduplicated.map(entry => entry.feature)
}

function unwrapLineGeometries(geometry: GeoJSON.Geometry): GeoJSON.Position[][] {
  if (geometry.type === 'LineString')
    return [geometry.coordinates as GeoJSON.Position[]]
  if (geometry.type === 'MultiLineString')
    return geometry.coordinates as GeoJSON.Position[][]
  return []
}

function buildBoundsFromRadius(center: GeoLocationLngLat, radiusMeters: number): Bounds {
  const [lng, lat] = center
  const latDelta = radiusMeters / 111320
  const constrainedCos = Math.max(Math.cos(lat * Math.PI / 180), 0.000001)
  const lngDelta = radiusMeters / (111320 * constrainedCos)
  return [
    lng - lngDelta,
    lat - latDelta,
    lng + lngDelta,
    lat + latDelta,
  ]
}

function bboxIntersects(a: Bounds, b: Bounds) {
  return !(a[0] > b[2] || a[2] < b[0] || a[1] > b[3] || a[3] < b[1])
}

function isPointInsideBounds(point: GeoLocationLngLat, bounds: Bounds) {
  return point[0] >= bounds[0] && point[0] <= bounds[2] && point[1] >= bounds[1] && point[1] <= bounds[3]
}

function createBubbleId(position: GeoLocationLngLat) {
  return `${position[0].toFixed(6)}:${position[1].toFixed(6)}`
}

function hasMinimumSpacing(point: GeoLocationLngLat, existing: BubbleFeature[], minDistance: number) {
  if (!existing.length)
    return true

  const candidate = turfPoint(point)
  for (const bubble of existing) {
    const distance = turfDistance(candidate, bubble, { units: 'meters' })
    if (distance < minDistance)
      return false
  }

  return true
}

function deterministicOffsetForLine(coords: GeoJSON.Position[], spacing: number) {
  if (!coords.length)
    return 0
  const hash = hashPositions(coords)
  const fraction = hash / 0xFFFFFFFF
  return fraction * spacing
}

async function ensureBubbleIcon(map: mapboxgl.Map) {
  if (!import.meta.client)
    return

  if (map.hasImage(BUBBLE_ICON_ID))
    return

  bubbleIconImagePromise ??= loadSvgImage(bubbleIconAssetUrl)
  const imageElement = await bubbleIconImagePromise

  if (map.hasImage(BUBBLE_ICON_ID))
    return

  const pixelRatio = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1
  map.addImage(BUBBLE_ICON_ID, imageElement, { pixelRatio })
}

function loadSvgImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    if (!import.meta.client) {
      reject(new Error('loadSvgImage can only run on the client'))
      return
    }

    const image = new Image()
    image.decoding = 'async'
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Failed to load bubble icon from ${url}`))
    image.src = url
  })
}

function hashPositions(coords: GeoJSON.Position[]) {
  let hash = 2166136261
  for (const position of coords) {
    const lng = toFixedInt(position[0])
    const lat = toFixedInt(position[1])
    hash ^= lng
    hash = Math.imul(hash, 16777619)
    hash ^= lat
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function toFixedInt(value: number) {
  return Math.round(value * 1e5)
}

function isVisitedPoint(point: GeoLocationLngLat, visitedTrack: VisitedTrackPoint[]) {
  if (!visitedTrack.length)
    return false

  const candidate = turfPoint(point)

  for (let i = visitedTrack.length - 1; i >= 0; i--) {
    const visited = visitedTrack[i]
    const distance = turfDistance(candidate, visited.turf, { units: 'meters' })
    if (distance <= VISITED_EXCLUSION_RADIUS_METERS)
      return true
  }

  return false
}
