interface UseMapCameraOptions {
  enabled?: MaybeRef<boolean | undefined>
  bearing?: MaybeRef<number | null | undefined>
}

export const DEFAULT_EASE_TO_OPTIONS: mapboxgl.EaseToOptions = {
  zoom: 18,
  pitch: 60,
  bearing: 0,
}

export function useMapCamera(
  map: mapboxgl.Map,
  position: MaybeRef<mapboxgl.LngLatLike>,
  { enabled = true, bearing }: UseMapCameraOptions = {},
) {
  const PLAYER_VERTICAL_OFFSET = 160
  const _position = toRef(position)
  const _enabled = toRef(enabled)
  const _bearing = bearing ? toRef(bearing) : null
  const defaultBearing = DEFAULT_EASE_TO_OPTIONS.bearing ?? 0
  const lastBearing = ref(defaultBearing)

  if (_bearing) {
    watch(_bearing, (value) => {
      if (typeof value === 'number' && Number.isFinite(value))
        lastBearing.value = normalizeBearing(value)
    }, { immediate: true })
  }

  function updateCamera(options: { instant?: boolean, force?: boolean } = {}) {
    if (!options.force && !_enabled.value)
      return

    const container = map.getContainer() as HTMLElement | null
    const fallbackHeight = typeof window === 'undefined' ? 0 : window.innerHeight
    const height = container?.clientHeight ?? fallbackHeight ?? 0
    const offsetY = PLAYER_VERTICAL_OFFSET - height / 2

    const instant = options.instant ?? false

    map.easeTo({
      ...DEFAULT_EASE_TO_OPTIONS,
      center: _position.value,
      offset: [0, -offsetY],
      bearing: lastBearing.value,
      duration: instant ? 0 : 300,
      essential: true,
      ...instant && { easing: (t: number) => t },
    })
  }

  map.on('load', () => {
    updateCamera({ instant: true })
  })

  map.on('resize', () => {
    updateCamera({ instant: true })
  })

  throttledWatch([_position, lastBearing], () => {
    updateCamera()
  }, { throttle: 100 })

  return { updateCamera }
}

function normalizeBearing(value: number) {
  const normalized = value % 360
  return normalized < 0 ? normalized + 360 : normalized
}
