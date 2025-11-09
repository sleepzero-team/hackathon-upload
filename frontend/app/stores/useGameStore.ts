import type { GeoLocationLngLat } from '~/types'
import type { NonNullableReturn } from '~/utils/types'
import { usePlayerEvolution } from '~/composables/usePlayerEvolution'
import { useWalkDistanceTracker } from '~/composables/useWalkDistanceTracker'
import { useUserProfileStore } from '~/stores/useUserProfile'

export type CameraFocusMode = 'none' | 'location' | 'heading'

interface GameStoreInit {
  playerPosition: Ref<GeoLocationLngLat>
  playerHeading?: Ref<number | null | undefined>
}

const [useProvideGameStore, _useGameStore] = createInjectionState(({ playerPosition, playerHeading }: GameStoreInit) => {
  const date = new Date()
  const realtimeNow = ref<Date>(date)
  const simulatedDate = ref<Date | null>(null)
  const now = computed(() => simulatedDate.value ?? realtimeNow.value)

  useIntervalFn(() => {
    realtimeNow.value = new Date()
  }, 5000)

  function adjustSimulatedHour(delta: number) {
    const base = simulatedDate.value ?? realtimeNow.value
    const adjusted = new Date(base)
    adjusted.setHours(adjusted.getHours() + delta)
    simulatedDate.value = adjusted
  }

  function incrementSimulatedHour() {
    adjustSimulatedHour(1)
  }

  function decrementSimulatedHour() {
    adjustSimulatedHour(-1)
  }

  function resetTimeSimulation() {
    simulatedDate.value = null
  }

  const isTimeSimulated = computed(() => simulatedDate.value !== null)

  const cameraFocusMode = ref<CameraFocusMode>('location')
  const isCameraFocused = computed(() => cameraFocusMode.value !== 'none')
  const heading = playerHeading ?? ref<number | null>(null)
  const { profile, addPoints: addUserPoints, resetPoints: resetUserPoints } = useUserProfileStore()
  const pacmanPoints = computed(() => profile.value.points)
  const walkDistanceMeters = computed(() => profile.value.walkDistanceMeters ?? 0)
  const playerEvolution = usePlayerEvolution()
  useWalkDistanceTracker(playerPosition)

  function addPacmanPoints(points = 1) {
    addUserPoints(points)
  }

  function resetPacmanPoints() {
    resetUserPoints()
  }

  return {
    playerPosition,
    playerHeading: heading,
    now,
    cameraFocusMode,
    isCameraFocused,
    pacmanPoints,
    walkDistanceMeters,
    playerEvolution,
    addPacmanPoints,
    resetPacmanPoints,
    incrementSimulatedHour,
    decrementSimulatedHour,
    resetTimeSimulation,
    isTimeSimulated,
  }
})

export const useGameStore = _useGameStore as NonNullableReturn<typeof _useGameStore>

export { useProvideGameStore }
