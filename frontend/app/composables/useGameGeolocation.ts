import type { GeoLocationLngLat } from '~/types'

declare global {
  interface DeviceOrientationEvent {
    webkitCompassHeading?: number | null
  }
}

const DEFAULT_POSITION: GeoLocationLngLat = [121.53512676260097, 25.02177462502842]
type DeviceOrientationPermissionState = 'granted' | 'denied' | 'default'
type DeviceOrientationEventWithPermission = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<DeviceOrientationPermissionState>
}

let compassListenerInitialized = false
type CompassPermissionResult = 'granted' | 'denied' | 'needs-gesture' | 'unsupported'
type CompassPermissionState = 'idle' | 'prompting' | 'granted' | 'denied' | 'unsupported'

interface GeoCoords {
  readonly heading: number | null
  readonly latitude: number
  readonly longitude: number
}

export function useGameGeolocation(isSimulated: MaybeRef<boolean> = false) {
  const playerPosition = ref<GeoLocationLngLat>(DEFAULT_POSITION)
  const gpsHeading = ref<number | null>(null)
  const compassHeading = ref<number | null>(null)
  const playerHeading = computed<number | null>(() => gpsHeading.value ?? compassHeading.value)
  const compassPermissionState = ref<CompassPermissionState>('idle')
  const _isSimulated = toRef(isSimulated)

  const { coords, error } = useGeolocation()

  watch(coords, (newCoords) => {
    updateHeading(newCoords)

    if (_isSimulated.value || error.value)
      return

    if (newCoords)
      playerPosition.value = [newCoords.longitude, newCoords.latitude]
  })

  watch(_isSimulated, (newIsSimlulated) => {
    if (error.value) {
      _isSimulated.value = true
      return
    }

    if (!newIsSimlulated) {
      const currentCoords = coords.value
      if (currentCoords) {
        updateHeading(currentCoords)
        playerPosition.value = [currentCoords.longitude, currentCoords.latitude]
      }
    }
  })

  function updateHeading(newCoords: GeoCoords | null | undefined) {
    const heading = newCoords?.heading
    if (typeof heading === 'number' && Number.isFinite(heading))
      gpsHeading.value = normalizeHeading(heading)
    else
      gpsHeading.value = null
  }

  if (import.meta.client)
    void initCompassHeadingFallback(false)

  async function requestCompassPermission() {
    if (!import.meta.client)
      return false

    if (compassPermissionState.value === 'granted' || compassListenerInitialized)
      return true

    compassPermissionState.value = 'prompting'
    const granted = await initCompassHeadingFallback(true)
    if (!granted && compassPermissionState.value === 'prompting')
      compassPermissionState.value = 'denied'

    return granted
  }

  async function initCompassHeadingFallback(promptUser: boolean) {
    if (compassListenerInitialized)
      return true

    if (typeof window === 'undefined' || !window.DeviceOrientationEvent) {
      compassPermissionState.value = 'unsupported'
      return false
    }

    const permissionResult = await ensureCompassPermission(promptUser)
    if (permissionResult !== 'granted') {
      updateCompassPermissionState(permissionResult)
      return false
    }

    compassPermissionState.value = 'granted'
    startCompassHeadingListener()
    return true
  }

  function startCompassHeadingListener() {
    if (compassListenerInitialized)
      return

    compassListenerInitialized = true
    useEventListener(window, 'deviceorientation', (event: DeviceOrientationEvent) => {
      const heading = extractCompassHeading(event)
      if (heading !== null)
        compassHeading.value = heading
    })
  }

  function updateCompassPermissionState(result: CompassPermissionResult) {
    if (result === 'unsupported')
      compassPermissionState.value = 'unsupported'
    else if (result === 'denied')
      compassPermissionState.value = 'denied'
    else if (result === 'needs-gesture')
      compassPermissionState.value = 'idle'
  }

  return {
    playerPosition,
    playerHeading,
    requestCompassPermission,
    compassPermissionState,
  }
}

function normalizeHeading(value: number) {
  const normalized = value % 360
  return normalized < 0 ? normalized + 360 : normalized
}

function extractCompassHeading(event: DeviceOrientationEvent) {
  const webkitHeading = event.webkitCompassHeading
  if (typeof webkitHeading === 'number' && Number.isFinite(webkitHeading))
    return normalizeHeading(webkitHeading)

  const alpha = event.alpha
  if (typeof alpha === 'number' && Number.isFinite(alpha) && event.absolute)
    return normalizeHeading(360 - alpha)

  return null
}

async function ensureCompassPermission(promptUser: boolean): Promise<CompassPermissionResult> {
  if (typeof window === 'undefined')
    return 'unsupported'

  const deviceOrientationCtor = window.DeviceOrientationEvent as DeviceOrientationEventWithPermission | undefined
  if (!deviceOrientationCtor)
    return 'unsupported'

  if (typeof deviceOrientationCtor.requestPermission !== 'function')
    return 'granted'

  if (!promptUser)
    return 'needs-gesture'

  try {
    const result = await deviceOrientationCtor.requestPermission()
    return result === 'granted' ? 'granted' : 'denied'
  } catch (error) {
    console.warn('[useGameGeolocation] Device orientation permission request failed', error)
    return 'denied'
  }
}
