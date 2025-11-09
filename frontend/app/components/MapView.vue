<script setup lang="ts">
import type mapboxgl from 'mapbox-gl'
import type { GeoLocationLngLat, ShadowRouteCollection } from '~/types'
import MapboxLanguage from '@mapbox/mapbox-gl-language'
import { nextTick } from 'vue'
import { useGeoRoutes, useMapPlayer } from '~/composables/useGameMap'
import { useMapbox } from '~/composables/useMapbox'
import { useMapBubbles } from '~/composables/useMapBubbles'
import { useMapBuildingShadows } from '~/composables/useMapBuildingShadows'
import { DEFAULT_EASE_TO_OPTIONS, useMapCamera } from '~/composables/useMapCamera'
import { useMapToilets } from '~/composables/useMapToilets'
import { useMapWaterDispensers } from '~/composables/useMapWaterDispensers'
import { useGameStore } from '~/stores/useGameStore'
import { useSettings } from '~/stores/useSettings'

const props = withDefaults(defineProps<{
  routeCollection?: ShadowRouteCollection | null
  selectedRouteId?: string | null
}>(), {
  routeCollection: null,
  selectedRouteId: null,
})

const routeCollection = computed(() => props.routeCollection ?? null)
const selectedRouteId = computed(() => props.selectedRouteId ?? null)

const { playerPosition, playerHeading, now, cameraFocusMode, addPacmanPoints, playerEvolution } = useGameStore()

const settings = useSettings()
const pacmanModeEnabled = computed(() => settings.value.pacmanModeEnabled ?? true)
const showToiletsEnabled = computed(() => settings.value.showToilets ?? false)
const showWaterDispensersEnabled = computed(() => settings.value.showWaterDispensers ?? false)
const showBuildingShadowsEnabled = computed(() => settings.value.showBuildingShadows ?? true)

const evolutionSprite = computed(() => playerEvolution.currentStage.value.sprite)

const runtimeConfig = useRuntimeConfig()
const elMap = useTemplateRef<HTMLDivElement>('elMap')

const { map, hooks } = useMapbox(elMap, {
  accessToken: runtimeConfig.public.mapboxAccessToken,
  options: {
    style: 'mapbox://styles/mapbox/streets-v12',
    center: playerPosition.value,
    ...DEFAULT_EASE_TO_OPTIONS,
    attributionControl: false,
  },
})

const ROUTE_FIT_PADDING: mapboxgl.PaddingOptions = { top: 124, right: 60, bottom: 260, left: 60 }

let zoomRoutesFn: ((options?: mapboxgl.FitBoundsOptions) => void) | null = null
let refocusCameraFn: ((options?: { instant?: boolean, force?: boolean }) => void) | null = null

hooks.hook('init', (map) => {
  useMapBuildingShadows(map, now, { visible: showBuildingShadowsEnabled })
  useMapBubbles(map, {
    playerPosition,
    onCollect: addPacmanPoints,
    enabled: pacmanModeEnabled,
  })
  useMapWaterDispensers(map, { visible: showWaterDispensersEnabled })
  useMapToilets(map, { visible: showToiletsEnabled })
  useMapPlayer(map, playerPosition, { sprite: evolutionSprite })

  const focusEnabled = computed(() => cameraFocusMode.value !== 'none')
  const defaultBearing = DEFAULT_EASE_TO_OPTIONS.bearing ?? 0
  const cameraBearing = computed(() => {
    if (cameraFocusMode.value === 'heading') {
      const headingValue = playerHeading.value
      return typeof headingValue === 'number' ? headingValue : defaultBearing
    }

    return defaultBearing
  })

  const { updateCamera } = useMapCamera(map, playerPosition, { enabled: focusEnabled, bearing: cameraBearing })
  refocusCameraFn = updateCamera
  const { zoom } = useGeoRoutes(map, routeCollection, { selectedRouteId })
  zoomRoutesFn = zoom

  watch(cameraFocusMode, (mode) => {
    if (mode !== 'none')
      updateCamera({ force: true })
  })

  watch([routeCollection, cameraFocusMode], async ([collection, mode]) => {
    if (!collection || mode !== 'none')
      return

    await nextTick()
    zoomRoutesFn?.({ padding: ROUTE_FIT_PADDING })
  }, { immediate: true })
})

// Camera interaction handling
const interactionCleanupFns: Array<() => void> = []
hooks.hook('init', (map) => {
  const handleCameraInterrupt = (event: mapboxgl.MapboxEvent<MouseEvent | TouchEvent | WheelEvent | KeyboardEvent>) => {
    if (!event.originalEvent || cameraFocusMode.value === 'none')
      return
    cameraFocusMode.value = 'none'
  }

  const interruptEvents: Array<keyof mapboxgl.MapEventType> = ['dragstart', 'rotatestart', 'pitchstart']
  interruptEvents.forEach((eventName) => {
    map.on(eventName, handleCameraInterrupt)
    interactionCleanupFns.push(() => map.off(eventName, handleCameraInterrupt))
  })
})

onBeforeUnmount(() => {
  interactionCleanupFns.splice(0).forEach(fn => fn())
  zoomRoutesFn = null
  refocusCameraFn = null
})

function moveByPixels(dx: number, dy: number): GeoLocationLngLat | null {
  if (!map.value)
    return null

  const currentPoint = map.value.project(playerPosition.value)
  const targetLngLat = map.value.unproject([
    currentPoint.x + dx,
    currentPoint.y + dy,
  ])

  return [targetLngLat.lng, targetLngLat.lat]
}

defineExpose({
  moveByPixels,
  fitRoutesBounds: (options?: mapboxgl.FitBoundsOptions) => {
    const finalOptions = options ? { ...options, padding: options.padding ?? ROUTE_FIT_PADDING } : { padding: ROUTE_FIT_PADDING }
    zoomRoutesFn?.(finalOptions)
  },
  refocusCamera: (options?: { instant?: boolean, force?: boolean }) => {
    refocusCameraFn?.(options ?? { force: true })
  },
})

hooks.hook('init', (map) => {
  const languageControl = new MapboxLanguage({ defaultLanguage: 'zh-Hant' })
  map.addControl(languageControl)
})
</script>

<template>
  <div ref="elMap" />
</template>
