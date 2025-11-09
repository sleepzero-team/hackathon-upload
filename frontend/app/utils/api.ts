import type { GeoLocationLngLat, ShadowRouteCollection } from '~/types'

interface ShadowRouteRequestBody {
  origin_lat: number
  origin_lng: number
  dest_lat: number
  dest_lng: number
  timestamp: string
  timezone?: string
  max_alternatives?: number
}

export async function fetchShadowRoute(
  origin: GeoLocationLngLat,
  destination: GeoLocationLngLat,
  timestamp = new Date(),
) {
  const body: ShadowRouteRequestBody = {
    origin_lat: origin[1],
    origin_lng: origin[0],
    dest_lat: destination[1],
    dest_lng: destination[0],
    timestamp: timestamp.toISOString(),
  }

  try {
    const response = await useNuxtApp().$api<ShadowRouteCollection>('/shadow-route', { method: 'POST', body })
    return response
  } catch (e) {
    if (import.meta.dev) {
      return await import('~/mocks/routeData').then(m => m.routeDemoData)
    }
    throw e
  }
}
