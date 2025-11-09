export interface ShadowRoute {
  route_id: string
  encoded_polyline: string
  distance_m: number
  duration: string
  description: string
  shadow_area_m2: number
  shadow_length_m: number
  building_count: number
  shadow_polygon_count: number
  wkt: string
}

export interface ShadowRouteCollection {
  origin: {
    lat: number
    lng: number
  }
  destination: {
    lat: number
    lng: number
  }
  travel_mode: 'WALK'
  best_route_id: string
  routes: ShadowRoute[]
}
