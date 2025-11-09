import type { ShadowRouteCollection } from '~/types'
import * as polyline from '@mapbox/polyline'

type LngLatTuple = [number, number]

export function geoJSONFromRouteData(routes: ShadowRouteCollection): GeoJSON.FeatureCollection<GeoJSON.Geometry> {
  return {
    type: 'FeatureCollection',
    features: routes.routes.map((r) => {
      const coordinates = decodePolylineToLngLat(r.encoded_polyline)

      return {
        type: 'Feature',
        properties: {
          route_id: r.route_id,
          description: r.description,
          distance_m: r.distance_m,
          duration: r.duration,
          shadow_area_m2: r.shadow_area_m2,
          shadow_length_m: r.shadow_length_m,
        },
        geometry: {
          type: 'LineString',
          coordinates,
        },
      }
    }),
  }
}

export function geoJSONOriginConnectors(routes: ShadowRouteCollection): GeoJSON.FeatureCollection<GeoJSON.LineString> {
  const origin: LngLatTuple = [routes.origin.lng, routes.origin.lat]

  const features = routes.routes.reduce<GeoJSON.Feature<GeoJSON.LineString>[]>((acc, route) => {
    const [firstCoordinate] = decodePolylineToLngLat(route.encoded_polyline)
    if (!firstCoordinate)
      return acc

    acc.push({
      type: 'Feature',
      properties: {
        route_id: route.route_id,
      },
      geometry: {
        type: 'LineString',
        coordinates: [origin, firstCoordinate],
      },
    })

    return acc
  }, [])

  return {
    type: 'FeatureCollection',
    features,
  }
}

function decodePolylineToLngLat(encoded: string): LngLatTuple[] {
  return polyline.decode(encoded).map(([lat, lng]) => [lng, lat])
}
