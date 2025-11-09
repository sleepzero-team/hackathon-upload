<script setup lang="ts">
import type { PlaceAutocompleteSelection, ShadowRoute, ShadowRouteCollection } from '~/types'
import { nextTick } from 'vue'
import MapView from '~/components/MapView.vue'
import PlaceAutocomplete from '~/components/PlaceAutocomplete.vue'
import TouchJoystick from '~/components/TouchJoystick.vue'
import { useGameGeolocation } from '~/composables/useGameGeolocation'
import { useKeyboardMovement } from '~/composables/useKeyboardMovement'
import { useVirtualJoyStick } from '~/composables/useVirtualJoyStick'
import { useProvideGameStore } from '~/stores/useGameStore'
import { cycleDebugModeSetting, useSettings } from '~/stores/useSettings'
import { useVisitedPositionsStore } from '~/stores/useVisitedPositions'
import { fetchShadowRoute } from '~/utils/api'

const DEV_COMPACT_SCREEN = false // import.meta.dev

const isSimulated = ref(false)

const settings = useSettings()
const showWaterDispensersSetting = computed({
  get: () => settings.value.showWaterDispensers ?? false,
  set: (value: boolean) => {
    settings.value.showWaterDispensers = value
  },
})
const showToiletsSetting = computed({
  get: () => settings.value.showToilets ?? false,
  set: (value: boolean) => {
    settings.value.showToilets = value
  },
})
const showBuildingShadowsSetting = computed({
  get: () => settings.value.showBuildingShadows ?? true,
  set: (value: boolean) => {
    settings.value.showBuildingShadows = value
  },
})

const isPacmanModeOn = computed({
  get: () => settings.value.pacmanModeEnabled ?? true,
  set: (value) => {
    settings.value.pacmanModeEnabled = value
  },
})

const { playerPosition, playerHeading, requestCompassPermission } = useGameGeolocation(isSimulated)

const routeCollection = shallowRef<ShadowRouteCollection | null>(null)
const selectedRouteId = ref<string | null>(null)
const isFetchingRoutes = ref(false)
const routingError = ref<string | null>(null)
const isNavigating = ref(false)

const sortedRoutes = computed<ShadowRoute[]>(() => {
  if (!routeCollection.value)
    return []

  const bestId = routeCollection.value.best_route_id
  return [...routeCollection.value.routes].sort((a, b) => {
    if (a.route_id === bestId)
      return -1
    if (b.route_id === bestId)
      return 1
    return a.distance_m - b.distance_m
  })
})

const hasMultipleRoutes = computed(() => sortedRoutes.value.length > 1)

const shadowRichRouteId = computed(() => {
  if (!hasMultipleRoutes.value)
    return null

  let richest: ShadowRoute | null = null
  for (const route of sortedRoutes.value) {
    if (!richest || (route.shadow_length_m ?? 0) > (richest.shadow_length_m ?? 0))
      richest = route
  }
  return richest?.route_id ?? null
})

const quickestRouteId = computed(() => {
  if (!hasMultipleRoutes.value)
    return null

  let fastest: ShadowRoute | null = null
  let shortestSeconds = Number.POSITIVE_INFINITY
  for (const route of sortedRoutes.value) {
    const seconds = getDurationSeconds(route.duration)
    if (seconds < shortestSeconds) {
      shortestSeconds = seconds
      fastest = route
    }
  }
  return fastest?.route_id ?? null
})

const bestRouteId = computed(() => routeCollection.value?.best_route_id ?? null)
const showRoutePanel = computed(() => sortedRoutes.value.length > 0 && !isNavigating.value)
const displayRouteCollection = computed<ShadowRouteCollection | null>(() => {
  const collection = routeCollection.value
  if (!collection)
    return null

  if (!isNavigating.value)
    return collection

  const routeId = selectedRouteId.value
  if (!routeId)
    return collection

  const target = collection.routes.find(route => route.route_id === routeId)
  if (!target)
    return collection

  return {
    ...collection,
    best_route_id: routeId,
    routes: [target],
  }
})

watch(routeCollection, (collection) => {
  if (!collection) {
    selectedRouteId.value = null
    isNavigating.value = false
    return
  }

  selectedRouteId.value = collection.best_route_id ?? collection.routes[0]?.route_id ?? null
})

const {
  cameraFocusMode,
  pacmanPoints,
  now,
  resetPacmanPoints,
  addPacmanPoints,
  incrementSimulatedHour,
  decrementSimulatedHour,
  resetTimeSimulation,
  isTimeSimulated,
} = useProvideGameStore({
  playerPosition,
  playerHeading,
})
const debugHourDisplay = computed(() => `${now.value.getHours().toString().padStart(2, '0')}:00`)

const profileDrawerOpen = ref(false)
const isSettingsPanelOpen = ref(false)
const settingsButtonIcon = computed(() => (isSettingsPanelOpen.value ? 'i-lucide-x' : 'i-lucide-settings-2'))
const settingsButtonLabel = computed(() => (isSettingsPanelOpen.value ? '關閉設定' : '開啟設定'))

const { clearVisitedPositions } = useVisitedPositionsStore()

const { handleJoystickMove, handleJoystickActiveChange } = useVirtualJoyStick(applyPixelMovement)

useKeyboardMovement(applyPixelMovement)

const mapViewRef = useTemplateRef('mapViewRef')
const placeInputRef = useTemplateRef('placeInputRef')

function applyPixelMovement(dx: number, dy: number) {
  isSimulated.value = true

  const mapComponent = mapViewRef.value
  if (!mapComponent)
    return

  const updatedPosition = mapComponent.moveByPixels(dx, dy)
  if (updatedPosition) {
    playerPosition.value = updatedPosition
  }
}

async function toggleCameraFocus() {
  if (cameraFocusMode.value === 'location') {
    const granted = await requestCompassPermission()
    if (granted)
      cameraFocusMode.value = 'heading'
    return
  }

  if (cameraFocusMode.value === 'heading') {
    cameraFocusMode.value = 'location'
    return
  }

  cameraFocusMode.value = 'location'
}

async function handlePlaceSelect(place: PlaceAutocompleteSelection) {
  if (isFetchingRoutes.value)
    return

  isFetchingRoutes.value = true
  routingError.value = null
  isNavigating.value = false

  try {
    const routes = await fetchShadowRoute(playerPosition.value, place.location, now.value)
    routeCollection.value = routes
    cameraFocusMode.value = 'none'
    await nextTick()
    mapViewRef.value?.fitRoutesBounds?.()
  } catch (error) {
    routingError.value = error instanceof Error ? error.message : '無法取得路線，請稍後再試。'
    routeCollection.value = null
  } finally {
    isFetchingRoutes.value = false
  }
}

function selectRoute(routeId: string) {
  selectedRouteId.value = routeId
}

function closeRoutesPanel() {
  routeCollection.value = null
  selectedRouteId.value = null
  routingError.value = null
  placeInputRef.value?.clear?.()
  isNavigating.value = false
  cameraFocusMode.value = 'location'
}

function focusPlaceInput() {
  placeInputRef.value?.focus?.()
}

async function startNavigation() {
  if (!selectedRouteId.value)
    return

  const granted = await requestCompassPermission()
  cameraFocusMode.value = granted ? 'heading' : 'location'
  isNavigating.value = true
  await nextTick()
  mapViewRef.value?.refocusCamera?.({ force: true })
}

function endNavigation() {
  isNavigating.value = false
  cameraFocusMode.value = 'location'
}

function toggleSettingsPanel() {
  isSettingsPanelOpen.value = !isSettingsPanelOpen.value
}

function formatDistance(distance: number) {
  if (distance >= 1000)
    return `${(distance / 1000).toFixed(1)} km`

  return `${Math.round(distance)} m`
}

function formatDuration(duration: string) {
  const match = /^(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i.exec(duration)
  if (!match)
    return duration

  let hours = match[1] ? Number(match[1]) : 0
  let minutes = match[2] ? Number(match[2]) : 0
  let seconds = match[3] ? Number(match[3]) : 0

  if (seconds > 60) {
    minutes += Math.ceil(seconds / 60)
    seconds = 0
  }
  if (minutes >= 60) {
    hours += Math.floor(minutes / 60)
    minutes %= 60
  }

  const parts = []
  if (hours)
    parts.push(`${hours}小時`)
  if (minutes)
    parts.push(`${minutes}分`)
  if (!hours && !minutes && seconds)
    parts.push(`${seconds}秒`)

  return parts.length ? parts.join('') : '即時'
}

function getDurationSeconds(duration: string) {
  const match = /^(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i.exec(duration)
  if (!match)
    return Number.POSITIVE_INFINITY

  const hours = match[1] ? Number(match[1]) : 0
  const minutes = match[2] ? Number(match[2]) : 0
  const seconds = match[3] ? Number(match[3]) : 0

  return (hours * 3600) + (minutes * 60) + seconds
}

function handleClearVisited() {
  clearVisitedPositions()
  resetPacmanPoints()
}
</script>

<template>
  <div
    class="relative w-full overflow-hidden"
    :class="DEV_COMPACT_SCREEN && 'max-w-2xl mx-auto'"
    style="height: var(--app-viewport-height, 100vh);"
  >
    <MapView
      v-if="!settings.debugHideMap"
      ref="mapViewRef"
      class="h-full w-full"
      :route-collection="displayRouteCollection"
      :selected-route-id="selectedRouteId"
    />

    <PlaceAutocomplete ref="placeInputRef" class="absolute top-4 left-4 right-4" @select="handlePlaceSelect" />

    <div class="absolute inset-x-0 bottom-0 pb-safe-or-9 px-4 space-y-3 pointer-events-none">
      <div class="flex justify-between items-end">
        <div class="space-y-3 **:pointer-events-auto">
          <UButton
            v-if="isNavigating"
            class="shadow-lg h-12 rounded-full px-6"
            color="error"
            variant="solid"
            size="xl"
            @click="endNavigation"
          >
            結束導航
          </UButton>
          <div class="flex justify-start">
            <UButton
              class="rounded-full shadow-lg h-12 w-12 justify-center z-1"
              variant="outline"
              color="neutral"
              size="md"
              icon="i-lucide-user"
              @click="profileDrawerOpen = true"
            />
            <div
              v-if="isPacmanModeOn"
              class="bg-white/80 backdrop-blur border-[0.5px] border-white -ml-6 pl-8 pr-3.5 rounded-r-full z-0 flex items-center space-x-1 text-xl"
              @click="profileDrawerOpen = true"
            >
              <UIcon name="i-ph-drop-duotone" class="text-error/75" />
              <span class="font-semibold text-error">{{ pacmanPoints }}</span>
            </div>
          </div>
        </div>

        <div class="flex justify-end **:pointer-events-auto">
          <div class="flex flex-col items-end gap-3 pointer-events-auto">
            <TransitionGroup
              tag="div"
              appear
              class="flex flex-col items-end gap-3"
              enter-active-class="transition duration-200 ease-out"
              enter-from-class="opacity-0 translate-y-3"
              enter-to-class="opacity-100 translate-y-0"
              leave-active-class="transition duration-150 ease-in"
              leave-from-class="opacity-100 translate-y-0"
              leave-to-class="opacity-0 translate-y-3"
              move-class="transition duration-200"
            >
              <div
                v-if="isSettingsPanelOpen"
                key="debug-toggle"
                class="flex justify-end"
              >
                <UButton
                  class="rounded-full shadow-lg h-12 w-12 justify-center"
                  :class="!settings.debugMode && 'bg-white hover:bg-white'"
                  :variant="settings.debugMode ? 'solid' : 'outline'"
                  color="error"
                  size="md"
                  icon="i-lucide-bug"
                  aria-label="切換調試模式"
                  :aria-pressed="settings.debugMode"
                  @click="cycleDebugModeSetting()"
                />
              </div>
              <div
                v-if="isSettingsPanelOpen"
                key="water-toggle"
                class="flex justify-end"
              >
                <UButton
                  class="rounded-full shadow-lg h-12 pr-4 pl-3 justify-center"
                  :variant="showWaterDispensersSetting ? 'solid' : 'outline'"
                  :color="showWaterDispensersSetting ? 'primary' : 'neutral'"
                  size="md"
                  icon="i-lucide-cup-soda"
                  aria-label="切換飲水機顯示"
                  :aria-pressed="showWaterDispensersSetting"
                  label="飲水"
                  @click="showWaterDispensersSetting = !showWaterDispensersSetting"
                />
              </div>
              <div
                v-if="isSettingsPanelOpen"
                key="toilet-toggle"
                class="flex justify-end"
              >
                <UButton
                  class="rounded-full shadow-lg h-12 pr-4 pl-3 justify-center"
                  :variant="showToiletsSetting ? 'solid' : 'outline'"
                  :color="showToiletsSetting ? 'primary' : 'neutral'"
                  size="md"
                  icon="i-lucide-toilet"
                  aria-label="切換公廁顯示"
                  label="公廁"
                  :aria-pressed="showToiletsSetting"
                  @click="showToiletsSetting = !showToiletsSetting"
                />
              </div>

              <div
                v-if="isSettingsPanelOpen"
                key="shadow-toggle"
                class="flex justify-end"
              >
                <UButton
                  class="rounded-full shadow-lg h-12 pr-4 pl-3 justify-center"
                  :variant="showBuildingShadowsSetting ? 'solid' : 'outline'"
                  :color="showBuildingShadowsSetting ? 'primary' : 'neutral'"
                  size="md"
                  icon="i-lucide-building-2"
                  label="陰影"
                  aria-label="切換建物陰影"
                  :aria-pressed="showBuildingShadowsSetting"
                  @click="showBuildingShadowsSetting = !showBuildingShadowsSetting"
                />
              </div>

              <div
                v-if="isSettingsPanelOpen"
                key="pacman-toggle"
                class="flex justify-end"
              >
                <UButton
                  class="rounded-full shadow-lg h-12 pr-4 pl-3 justify-center"
                  :variant="isPacmanModeOn ? 'solid' : 'outline'"
                  :color="isPacmanModeOn ? 'primary' : 'neutral'"
                  size="md"
                  icon="i-lucide-ghost"
                  :aria-pressed="isPacmanModeOn"
                  label="漫步"
                  @click="isPacmanModeOn = !isPacmanModeOn"
                />
              </div>
            </TransitionGroup>

            <UButton
              class="rounded-full shadow-lg h-12 w-12 justify-center"
              :variant="isSettingsPanelOpen ? 'solid' : 'outline'"
              :color="isSettingsPanelOpen ? 'primary' : 'neutral'"
              size="md"
              :icon="settingsButtonIcon"
              :aria-label="settingsButtonLabel"
              :aria-expanded="isSettingsPanelOpen"
              @click="toggleSettingsPanel"
            />

            <UButton
              class="rounded-full shadow-lg h-12 w-12 justify-center"
              variant="outline"
              color="neutral"
              size="md"
              aria-label="搜尋地點"
              @click="focusPlaceInput"
            >
              <UIcon name="i-lucide-search" class="text-lg " />
            </UButton>

            <UButton
              class="rounded-full shadow-lg h-12 w-12 justify-center"
              :variant="cameraFocusMode === 'none' ? 'subtle' : 'solid'"
              :color="cameraFocusMode === 'heading' ? 'primary' : 'neutral'"
              size="md"
              @click="toggleCameraFocus"
            >
              <UIcon
                name="i-lucide-navigation-2"
                class="text-lg transition-transform"
                :class="[
                  cameraFocusMode === 'heading' ? 'text-white' : 'rotate-45',
                ]"
              />
            </UButton>
          </div>
        </div>
      </div>

      <UAlert
        v-if="routingError"
        class="pointer-events-auto"
        color="error"
        variant="solid"
        icon="i-lucide-alert-circle"
        :title="routingError"
      />

      <UCard v-if="isFetchingRoutes" class="pointer-events-auto bg-white/90 text-sm">
        <div class="flex items-center gap-2 text-neutral-600">
          <UIcon name="i-lucide-loader-2" class="animate-spin" />
          計算最佳行走路線中...
        </div>
      </UCard>

      <div
        v-if="showRoutePanel"
        class="pointer-events-auto rounded-2xl bg-white/95 shadow-lg max-h-[180px] overflow-hidden flex flex-col"
      >
        <div class="sticky top-0 z-10 flex items-center justify-between gap-2 px-4 py-2 text-xs font-semibold text-neutral-600 bg-white/95">
          <span>建議路線</span>
          <UButton
            icon="i-lucide-x"
            size="sm"
            color="neutral"
            variant="ghost"
            @click="closeRoutesPanel"
          />
        </div>
        <div class="flex-1 overflow-y-auto pt-1 px-3 pb-3 space-y-2">
          <div
            v-for="route in sortedRoutes"
            :key="route.route_id"
            class="w-full"
          >
            <div
              role="button"
              tabindex="0"
              class="rounded-2xl border px-4 py-3 transition-all outline-none"
              :class="route.route_id === selectedRouteId ? 'border-primary-500 bg-primary-50 shadow-md ring-2 ring-primary-200' : 'border-neutral-200 bg-white hover:border-neutral-300 focus-visible:ring-2 focus-visible:ring-primary-200'"
              @click="selectRoute(route.route_id)"
              @keydown.enter.prevent="selectRoute(route.route_id)"
            >
              <div class="flex items-center justify-between gap-2">
                <div class="font-medium text-neutral-900">
                  {{ route.description }}
                </div>
              </div>
              <div class="flex justify-between">
                <div>
                  <div class="mt-1 flex flex-wrap items-center gap-1 text-sm">
                    <span class="text-neutral-600">
                      {{ formatDistance(route.distance_m) }}
                    </span>
                    <span class="text-neutral-400">
                      ・
                    </span>
                    <span
                      class="inline-flex items-center gap-1"
                      :class="route.route_id === quickestRouteId ? 'text-primary-600 font-semibold' : 'text-neutral-600'"
                    >
                      {{ formatDuration(route.duration) }}
                      <UIcon
                        v-if="route.route_id === quickestRouteId"
                        name="i-lucide-thumbs-up"
                        class="text-primary-500 text-xs"
                        aria-hidden="true"
                      />
                    </span>
                  </div>
                  <div
                    class="mt-1 flex items-center gap-1 text-xs"
                    :class="route.route_id === shadowRichRouteId ? 'text-primary-600 font-semibold' : 'text-neutral-500'"
                  >
                    <span>
                      陽光遮蔽 {{ Math.round(route.shadow_length_m) }}m ({{ ((route.shadow_length_m / route.distance_m) * 100).toFixed(1) }}%)
                    </span>
                    <UIcon
                      v-if="route.route_id === shadowRichRouteId"
                      name="i-lucide-thumbs-up"
                      class="text-primary-500 text-xs"
                      aria-hidden="true"
                    />
                  </div>
                </div>

                <div v-if="route.route_id === selectedRouteId" class="mt-3 flex justify-end">
                  <UButton
                    color="primary"
                    icon="i-lucide-navigation-2"
                    @click.stop="startNavigation"
                  >
                    開始
                  </UButton>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <MapProfileDrawer v-model:open="profileDrawerOpen" />

    <!-- debug tools -->
    <div v-if="settings.debugMode === 'full'" class="absolute w-[108px] overflow-hidden left-4 top-18 flex flex-col items-start gap-2 rounded-lg bg-black/60 p-2 text-xs text-white shadow-lg backdrop-blur">
      <UButton size="xs" color="neutral" @click="isSimulated = !isSimulated">
        {{ isSimulated ? 'Simulated' : 'GPS' }}
      </UButton>
      <UButton size="xs" color="neutral" @click="settings.debugHideMap = !settings.debugHideMap">
        Map: {{ settings.debugHideMap ? 'Off' : 'On' }}
      </UButton>
      <UButton size="xs" color="neutral" @click="handleClearVisited">
        Reset
      </UButton>
      <div class="w-full rounded border border-white/10 p-1">
        <div class="mb-1 text-[10px] uppercase tracking-wide text-white/70">
          Time Sim
        </div>
        <div class="flex items-center gap-1">
          <UButton size="xs" color="neutral" class="flex-1" @click="decrementSimulatedHour">
            -
          </UButton>
          <span class="flex-1 text-center font-mono text-[10px]">
            {{ debugHourDisplay }}
          </span>
          <UButton size="xs" color="neutral" class="flex-1" @click="incrementSimulatedHour">
            +
          </UButton>
        </div>
        <UButton
          size="xs"
          color="neutral"
          class="mt-1 w-full"
          :disabled="!isTimeSimulated"
          @click="resetTimeSimulation"
        >
          Reset Time
        </UButton>
      </div>
      <div class="font-mono text-[8px]">
        {{ playerPosition[0] }},<br>
        {{ playerPosition[1] }},<br>
        {{ playerHeading }}
      </div>
    </div>

    <!-- debug joystick -->
    <div v-if="settings.debugMode" class="absolute top-18 right-4">
      <TouchJoystick
        @move="handleJoystickMove"
        @active-change="handleJoystickActiveChange"
      />
    </div>
  </div>
</template>
