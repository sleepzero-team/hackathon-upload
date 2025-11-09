import { PLAYER_EVOLUTION_STAGES } from '~/constants/playerEvolution'
import { useUserProfileStore } from '~/stores/useUserProfile'

export function usePlayerEvolution() {
  const { profile } = useUserProfileStore()

  const points = computed(() => profile.value.points)

  const currentStage = computed(() => {
    const value = points.value
    let stage = PLAYER_EVOLUTION_STAGES[0]

    for (const candidate of PLAYER_EVOLUTION_STAGES) {
      if (value >= candidate.minPoints)
        stage = candidate
      else
        break
    }

    return stage
  })

  const nextStage = computed(() => {
    const currentIndex = PLAYER_EVOLUTION_STAGES.findIndex(stage => stage.id === currentStage.value.id)
    if (currentIndex === -1)
      return null

    return PLAYER_EVOLUTION_STAGES[currentIndex + 1] ?? null
  })

  const nextStageProgressRatio = computed(() => {
    const next = nextStage.value
    if (!next)
      return 1

    const currentMin = currentStage.value.minPoints
    const span = next.minPoints - currentMin
    if (span <= 0)
      return 1

    return Math.min(1, (points.value - currentMin) / span)
  })

  const pointsToNextStage = computed(() => {
    const next = nextStage.value
    if (!next)
      return 0
    return Math.max(0, next.minPoints - points.value)
  })

  return {
    points,
    currentStage,
    nextStage,
    nextStageProgressRatio,
    pointsToNextStage,
  }
}
