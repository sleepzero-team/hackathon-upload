import type { GeoLocationLngLat } from '~/types'

export interface StoredVisitedPosition {
  coords: GeoLocationLngLat
  timestamp: number
}

const VISITED_POSITIONS_STORAGE_KEY = 'sz-visited-positions'
export const VISITED_POSITIONS_TTL_MS = 24 * 60 * 60 * 1000
export const VISITED_POSITIONS_MAX_ENTRIES = 6000

const useVisitedPositionsState = createGlobalState(() => {
  const visitedPositions = useLocalStorage<StoredVisitedPosition[]>(VISITED_POSITIONS_STORAGE_KEY, [], {
    mergeDefaults: true,
  })

  function pruneExpired(reference = Date.now()) {
    if (!visitedPositions.value.length)
      return

    const ttlBoundary = reference - VISITED_POSITIONS_TTL_MS
    const next = visitedPositions.value.filter(entry => entry.timestamp >= ttlBoundary)

    if (next.length !== visitedPositions.value.length)
      visitedPositions.value = next
  }

  if (import.meta.client)
    pruneExpired()

  function addVisitedPosition(coords: GeoLocationLngLat, timestamp = Date.now()) {
    pruneExpired(timestamp)

    const normalized: GeoLocationLngLat = [
      Number(coords[0].toFixed(6)),
      Number(coords[1].toFixed(6)),
    ]

    const next = [...visitedPositions.value, { coords: normalized, timestamp }]

    if (next.length > VISITED_POSITIONS_MAX_ENTRIES)
      next.splice(0, next.length - VISITED_POSITIONS_MAX_ENTRIES)

    visitedPositions.value = next
  }

  function clearVisitedPositions() {
    visitedPositions.value = []
  }

  return {
    visitedPositions,
    addVisitedPosition,
    pruneExpired,
    clearVisitedPositions,
  }
})

export function useVisitedPositionsStore() {
  return useVisitedPositionsState()
}
