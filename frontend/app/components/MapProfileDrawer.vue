<script setup lang="ts">
import { useGameStore } from '~/stores/useGameStore'
import { useSettings } from '~/stores/useSettings'

const open = defineModel<boolean>('open', { default: false })

const CALORIES_PER_METER = 0.05

const { pacmanPoints, playerEvolution, addPacmanPoints, walkDistanceMeters } = useGameStore()
const settings = useSettings()

const currentEvolutionStage = computed(() => playerEvolution.currentStage.value)
const nextEvolutionStage = computed(() => playerEvolution.nextStage.value)
const hasNextEvolutionStage = computed(() => Boolean(nextEvolutionStage.value))
const profileDisplayName = computed(() => currentEvolutionStage.value.label)
const profileImageSrc = computed(() => currentEvolutionStage.value.largeSprite?.src ?? currentEvolutionStage.value.sprite.src)
const profileImageAlt = computed(() => `${profileDisplayName.value} 造型`)
const totalCollectedPoints = computed(() => pacmanPoints.value)
const stageProgressValue = computed(() => Math.max(0, totalCollectedPoints.value - currentEvolutionStage.value.minPoints))
const stageProgressTarget = computed(() => {
  if (!nextEvolutionStage.value)
    return null

  return Math.max(1, nextEvolutionStage.value.minPoints - currentEvolutionStage.value.minPoints)
})
const nextStageProgressPercent = computed(() => Math.round(playerEvolution.nextStageProgressRatio.value * 100))
const pointsToNextStage = computed(() => playerEvolution.pointsToNextStage.value)
const stageProgressLabel = computed(() => {
  if (!stageProgressTarget.value)
    return '已達最終型態'

  return `${stageProgressValue.value} / ${stageProgressTarget.value}`
})
const nextStageDescription = computed(() => {
  if (!nextEvolutionStage.value)
    return '最終型態'

  return `下一型態：${nextEvolutionStage.value.label}`
})
const nextStageStatusLabel = computed(() => {
  if (!hasNextEvolutionStage.value)
    return '辛苦啦！已經是最終型態'

  return `還差 ${pointsToNextStage.value} 點，出去走走收集吧！`
})
const isPacmanModeOn = computed(() => settings.value.pacmanModeEnabled ?? true)
const formattedWalkDistance = computed(() => formatDistance(walkDistanceMeters.value))
const burnedCalories = computed(() => Math.max(0, Math.round(walkDistanceMeters.value * CALORIES_PER_METER)))
const formattedCalories = computed(() => new Intl.NumberFormat('zh-TW').format(burnedCalories.value))

function handleDebugPointsIncrement() {
  if (!settings.value.debugMode)
    return

  addPacmanPoints(10)
}

function closeDrawer() {
  open.value = false
}

function formatDistance(distanceMeters: number) {
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0)
    return '0 m'

  if (distanceMeters >= 1000)
    return `${(distanceMeters / 1000).toFixed(2)} km`

  return `${Math.round(distanceMeters)} m`
}
</script>

<template>
  <UDrawer
    v-model:open="open"
    title="個人檔案"
    direction="bottom"
  >
    <template #content>
      <div class="relative px-6 pb-10 pt-6 space-y-6 text-center">
        <button
          type="button"
          class="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/80 text-neutral-700 shadow ring-1 ring-white/70 backdrop-blur focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
          aria-label="關閉"
          @click="closeDrawer"
        >
          <UIcon
            name="i-lucide-x"
            class="text-xl"
            aria-hidden="true"
          />
          <span class="sr-only">關閉</span>
        </button>

        <div class="space-y-2">
          <p class="text-sm text-neutral-500">
            目前型態
          </p>
          <p class="text-xl font-semibold text-neutral-900">
            {{ profileDisplayName }}
          </p>
        </div>

        <img
          v-if="profileImageSrc"
          :src="profileImageSrc"
          :alt="profileImageAlt"
          class="mx-auto h-40 w-auto max-w-full drop-shadow-xl"
        >

        <div class="flex justify-center">
          <button
            v-if="isPacmanModeOn"
            type="button"
            class="inline-flex items-center space-x-2 rounded-full bg-red-100/90 px-5 py-2 text-2xl font-semibold text-red-500 ring-2 ring-red-400"
            :class="settings.debugMode ? 'cursor-pointer focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary-200/60' : 'cursor-default'"
            :aria-label="settings.debugMode ? '調試：增加 10 點' : undefined"
            aria-live="polite"
            @click="handleDebugPointsIncrement"
          >
            <span class="sr-only">目前點數</span>
            <UIcon
              name="i-ph-drop-duotone"
              class="text-3xl"
              aria-hidden="true"
            />
            <span>{{ totalCollectedPoints }}</span>
          </button>
          <div v-else class="inline-flex items-center space-x-2 rounded-full bg-red-100/90 px-5 py-2 text-2xl font-semibold text-red-500 ring-2 ring-red-400" aria-live="polite">
            <span class="sr-only">目前點數</span>
            <UIcon
              name="i-ph-drop-duotone"
              class="text-3xl"
              aria-hidden="true"
            />
            <span>{{ totalCollectedPoints }}</span>
          </div>
        </div>

        <div class="space-y-3 rounded-3xl bg-white/60 px-5 py-4 text-left shadow-sm ring-1 ring-white/60">
          <div class="flex items-center justify-between text-sm text-neutral-500">
            <p class="font-semibold text-neutral-900">
              進化進度
            </p>
            <p class="text-neutral-500">
              {{ nextStageDescription }}
            </p>
          </div>
          <UProgress
            :model-value="nextStageProgressPercent"
            :max="100"
            size="md"
            color="primary"
            class="w-full"
          />
          <div class="flex items-center justify-between text-sm text-neutral-700">
            <p>
              {{ stageProgressLabel }}
            </p>
            <p :class="hasNextEvolutionStage ? 'text-primary-500' : 'text-neutral-400'">
              {{ nextStageStatusLabel }}
            </p>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3 rounded-3xl bg-neutral-900/90 px-5 py-4 text-left text-white shadow-sm">
          <div class="space-y-1">
            <p class="text-sm text-neutral-200">
              步行距離
            </p>
            <div class="flex items-baseline space-x-1">
              <UIcon
                name="i-ph-footprints-duotone"
                class="text-xl text-primary-300"
                aria-hidden="true"
              />
              <p class="text-2xl font-semibold" aria-live="polite">
                {{ formattedWalkDistance }}
              </p>
            </div>
          </div>
          <div class="space-y-1">
            <p class="text-sm text-neutral-200">
              消耗熱量
            </p>
            <div class="flex items-baseline space-x-1">
              <UIcon
                name="i-ph-flame-duotone"
                class="text-xl text-amber-300"
                aria-hidden="true"
              />
              <p class="text-2xl font-semibold" aria-live="polite">
                {{ formattedCalories }} kcal
              </p>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UDrawer>
</template>
