import type { GeoLocationLngLat } from '~/types'
import { distance as turfDistance, point as turfPoint } from '@turf/turf'
import { useUserProfileStore } from '~/stores/useUserProfile'
import { useVisitedPositionsStore } from '~/stores/useVisitedPositions'

const DEFAULT_MIN_WALK_SPEED_MPS = 0.08 // ~0.3 km/h
const DEFAULT_MAX_WALK_SPEED_MPS = 8 // ~28.8 km/h
const DEFAULT_MIN_STEP_DISTANCE_METERS = 1
const DEFAULT_MAX_STEP_DISTANCE_METERS = 500
const DEFAULT_MAX_SAMPLE_GAP_SECONDS = 120
const VISITED_DISTANCE_FLOOR_METERS = 1

interface WalkSample {
  coords: GeoLocationLngLat
  timestamp: number
}

interface WalkDistanceTrackerOptions {
  minSpeedMps?: number
  maxSpeedMps?: number
  minDistanceMeters?: number
  maxDistanceMeters?: number
  maxSampleGapSeconds?: number
}

export function useWalkDistanceTracker(
  playerPosition: MaybeRef<GeoLocationLngLat | null | undefined>,
  {
    minSpeedMps = DEFAULT_MIN_WALK_SPEED_MPS,
    maxSpeedMps = DEFAULT_MAX_WALK_SPEED_MPS,
    minDistanceMeters = DEFAULT_MIN_STEP_DISTANCE_METERS,
    maxDistanceMeters = DEFAULT_MAX_STEP_DISTANCE_METERS,
    maxSampleGapSeconds = DEFAULT_MAX_SAMPLE_GAP_SECONDS,
  }: WalkDistanceTrackerOptions = {},
) {
  const { addWalkDistance } = useUserProfileStore()
  const { visitedPositions } = useVisitedPositionsStore()
  const _playerPosition = toRef(playerPosition)
  const lastSample = shallowRef<WalkSample | null>(null)
  const fallbackEnabled = ref(true)
  const lastVisitedTimestamp = shallowRef<number | null>(null)
  const lastVisitedCoords = shallowRef<GeoLocationLngLat | null>(null)
  let fallbackResumeTimer: number | null = null

  const stopFallbackWatch = watch([_playerPosition, fallbackEnabled], ([nextPosition, enabled]) => {
    if (!enabled) {
      lastSample.value = null
      return
    }

    if (!nextPosition) {
      lastSample.value = null
      return
    }

    const currentSample: WalkSample = {
      coords: normalizeCoords(nextPosition),
      timestamp: Date.now(),
    }

    const previousSample = lastSample.value
    lastSample.value = currentSample

    if (!previousSample)
      return

    const elapsedSeconds = (currentSample.timestamp - previousSample.timestamp) / 1000
    if (elapsedSeconds <= 0 || elapsedSeconds > maxSampleGapSeconds)
      return

    const distanceMeters = calculateDistanceMeters(previousSample.coords, currentSample.coords)
    if (!Number.isFinite(distanceMeters))
      return

    if (distanceMeters < minDistanceMeters || distanceMeters > maxDistanceMeters)
      return

    const speed = distanceMeters / elapsedSeconds
    if (speed < minSpeedMps || speed > maxSpeedMps)
      return

    addWalkDistance(distanceMeters)
  }, { immediate: true })

  const stopVisitedWatch = watch(visitedPositions, (positions) => {
    if (!positions.length) {
      lastVisitedCoords.value = null
      lastVisitedTimestamp.value = null
      enableFallback()
      return
    }

    const latest = positions[positions.length - 1]
    if (lastVisitedTimestamp.value && latest.timestamp <= lastVisitedTimestamp.value) {
      disableFallbackTemporarily()
      lastVisitedCoords.value = [...latest.coords] as GeoLocationLngLat
      return
    }

    const previousCoords = lastVisitedCoords.value ?? positions[positions.length - 2]?.coords ?? null

    if (previousCoords) {
      const distanceMeters = calculateDistanceMeters(previousCoords, latest.coords)
      if (Number.isFinite(distanceMeters) && distanceMeters >= VISITED_DISTANCE_FLOOR_METERS && distanceMeters <= maxDistanceMeters)
        addWalkDistance(distanceMeters)
    }

    lastVisitedCoords.value = [...latest.coords] as GeoLocationLngLat
    lastVisitedTimestamp.value = latest.timestamp
    disableFallbackTemporarily()
  }, { immediate: true, deep: true })

  tryOnScopeDispose(() => {
    stopFallbackWatch()
    stopVisitedWatch()
    if (fallbackResumeTimer)
      clearTimeout(fallbackResumeTimer)
  })

  function enableFallback() {
    fallbackEnabled.value = true
    if (fallbackResumeTimer) {
      clearTimeout(fallbackResumeTimer)
      fallbackResumeTimer = null
    }
  }

  function disableFallbackTemporarily() {
    fallbackEnabled.value = false
    if (fallbackResumeTimer)
      clearTimeout(fallbackResumeTimer)

    if (!import.meta.client)
      return

    fallbackResumeTimer = window.setTimeout(() => {
      fallbackEnabled.value = true
      fallbackResumeTimer = null
    }, maxSampleGapSeconds * 1000)
  }
}

function calculateDistanceMeters(from: GeoLocationLngLat, to: GeoLocationLngLat) {
  const start = turfPoint(from)
  const end = turfPoint(to)
  return turfDistance(start, end, { units: 'meters' })
}

function normalizeCoords(coords: GeoLocationLngLat): GeoLocationLngLat {
  return [
    Number(coords[0].toFixed(6)),
    Number(coords[1].toFixed(6)),
  ]
}
