declare module '@mapbox/mapbox-gl-language' {
  import type { IControl } from 'mapbox-gl'

  export interface MapboxLanguageOptions {
    defaultLanguage?: string
    excludedLayerIds?: string[]
    getLanguageField?: (language: string) => string
    languageField?: RegExp
    languageSource?: string
    languageTransform?: (style: mapboxgl.Style, language: string) => mapboxgl.Style
    supportedLanguages?: string[]
  }

  export default class MapboxLanguage implements IControl {
    constructor(options?: MapboxLanguageOptions)
    onAdd(map: mapboxgl.Map): HTMLElement
    onRemove(): void
    setLanguage(style: mapboxgl.Style, language: string): mapboxgl.Style
  }
}
