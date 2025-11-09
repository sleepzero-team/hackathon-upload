export * from './shadowRoute'

export type GeoLocationLngLat = [number, number]

export type GeoJSON = GeoJSON.FeatureCollection | GeoJSON.Feature

export interface PlaceAutocompleteSelection {
  description: string
  placeId: string
  location: GeoLocationLngLat
  name?: string
}
