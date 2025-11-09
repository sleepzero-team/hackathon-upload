<script setup lang="ts">
import type { PlaceAutocompleteSelection } from '~/types'
import { onClickOutside, useDebounceFn } from '@vueuse/core'
import { createGooglePlacesClients } from '~/composables/useGooglePlaces'

const props = withDefaults(defineProps<{
  placeholder?: string
  debounce?: number
}>(), {
  placeholder: '搜尋地點',
  debounce: 300,
})

const emit = defineEmits<{
  select: [PlaceAutocompleteSelection]
}>()

const query = ref('')
const predictions = shallowRef<google.maps.places.AutocompletePrediction[]>([])
const highlightedIndex = ref(-1)
const isDropdownOpen = ref(false)
const isPredictionsLoading = ref(false)
const isDetailsLoading = ref(false)
const errorMessage = ref<string | null>(null)
const scriptError = ref<string | null>(null)

const autocompleteService = shallowRef<google.maps.places.AutocompleteService | null>(null)
const placesService = shallowRef<google.maps.places.PlacesService | null>(null)
const mapsApi = shallowRef<typeof google.maps | null>(null)
const sessionToken = shallowRef<google.maps.places.AutocompleteSessionToken | null>(null)

const containerRef = useTemplateRef<HTMLElement>('containerRef')

const debouncedFetchPredictions = useDebounceFn(fetchPredictions, props.debounce)

const trimmedQuery = computed(() => query.value.trim())
const suppressDropdownOnce = ref(false)
const isBusy = computed(() => isPredictionsLoading.value || isDetailsLoading.value)
const shouldShowDropdown = computed(() => isDropdownOpen.value && (trimmedQuery.value.length > 0 || !!scriptError.value))
const showEmptyState = computed(() => !isBusy.value && !errorMessage.value && !scriptError.value && isDropdownOpen.value && !predictions.value.length && !!trimmedQuery.value.length)

onMounted(() => {
  initPlacesClients()
})

onClickOutside(containerRef, () => {
  closeDropdown()
})

watch(
  () => trimmedQuery.value,
  (value) => {
    if (suppressDropdownOnce.value) {
      suppressDropdownOnce.value = false
      return
    }

    highlightedIndex.value = -1

    if (!value) {
      predictions.value = []
      errorMessage.value = null
      closeDropdown()
      resetSessionToken()
      return
    }

    isDropdownOpen.value = true

    if (!autocompleteService.value)
      return

    debouncedFetchPredictions()
  },
)

function handleFocus(): void {
  if (trimmedQuery.value)
    isDropdownOpen.value = true
}

function handleKeydown(event: KeyboardEvent): void {
  if (!shouldShowDropdown.value)
    return

  if (event.key === 'ArrowDown') {
    event.preventDefault()
    moveHighlight(1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    moveHighlight(-1)
  } else if (event.key === 'Enter') {
    if (highlightedIndex.value >= 0 && highlightedIndex.value < predictions.value.length) {
      event.preventDefault()
      selectPrediction(predictions.value[highlightedIndex.value])
    }
  } else if (event.key === 'Escape') {
    closeDropdown()
  }
}

function moveHighlight(direction: 1 | -1): void {
  if (!predictions.value.length) {
    return
  }

  const nextIndex = highlightedIndex.value + direction
  if (nextIndex < 0) {
    highlightedIndex.value = predictions.value.length - 1

    return
  }

  if (nextIndex >= predictions.value.length) {
    highlightedIndex.value = 0

    return
  }

  highlightedIndex.value = nextIndex
}

async function initPlacesClients(): Promise<void> {
  scriptError.value = null

  try {
    const { maps, autocomplete, places } = await createGooglePlacesClients()
    mapsApi.value = maps
    autocompleteService.value = autocomplete
    placesService.value = places
  } catch (error) {
    scriptError.value = (error as Error)?.message ?? '目前無法載入 Google 地點服務。'
  }
}

function fetchPredictions(): void {
  if (!autocompleteService.value || !mapsApi.value) {
    return
  }

  isPredictionsLoading.value = true
  errorMessage.value = null

  autocompleteService.value.getPlacePredictions(
    {
      input: trimmedQuery.value,
      sessionToken: ensureSessionToken(),
      componentRestrictions: { country: ['tw'] },
    },
    (results, status) => {
      isPredictionsLoading.value = false

      if (status === mapsApi.value!.places.PlacesServiceStatus.ZERO_RESULTS || !results?.length) {
        predictions.value = []

        return
      }

      if (status !== mapsApi.value!.places.PlacesServiceStatus.OK) {
        predictions.value = []
        errorMessage.value = `Google 地點服務錯誤：${status}`

        return
      }

      predictions.value = results
    },
  )
}

function selectPrediction(prediction: google.maps.places.AutocompletePrediction): void {
  if (!placesService.value || !mapsApi.value) {
    return
  }

  isDetailsLoading.value = true
  errorMessage.value = null

  placesService.value.getDetails(
    {
      placeId: prediction.place_id,
      fields: ['geometry', 'name', 'formatted_address'],
      sessionToken: sessionToken.value ?? undefined,
    },
    (details, status) => {
      isDetailsLoading.value = false

      if (status !== mapsApi.value!.places.PlacesServiceStatus.OK || !details?.geometry?.location) {
        errorMessage.value = '無法取得地點資訊，請選擇其他結果。'

        return
      }

      const location = details.geometry.location
      const payload: PlaceAutocompleteSelection = {
        description: details.formatted_address || prediction.description,
        placeId: prediction.place_id,
        location: [location.lng(), location.lat()],
        name: details.name ?? undefined,
      }

      emit('select', payload)

      query.value = payload.description
      predictions.value = []
      closeDropdown()
      suppressDropdownOnce.value = true
      blurInput()
      resetSessionToken()
    },
  )
}

function ensureSessionToken(): google.maps.places.AutocompleteSessionToken | undefined {
  if (!mapsApi.value) {
    return undefined
  }

  sessionToken.value = sessionToken.value ?? new mapsApi.value.places.AutocompleteSessionToken()

  return sessionToken.value
}

function resetSessionToken(): void {
  sessionToken.value = null
}

function closeDropdown(): void {
  isDropdownOpen.value = false
  highlightedIndex.value = -1
}

function clearQuery(): void {
  query.value = ''
  predictions.value = []
  errorMessage.value = null
  closeDropdown()
}

function retryLoading(): void {
  initPlacesClients()
}

function blurInput(): void {
  const inputEl = containerRef.value?.querySelector('input') as HTMLInputElement | null
  inputEl?.blur()
}

function focusInput(): void {
  const inputEl = containerRef.value?.querySelector('input') as HTMLInputElement | null
  inputEl?.focus()
}

function formatMainTextChunks(prediction: google.maps.places.AutocompletePrediction): Array<{ text: string, match: boolean }> {
  const { main_text: text, main_text_matched_substrings: matches } = prediction.structured_formatting

  if (!matches?.length) {
    return [{ text, match: false }]
  }

  const chunks: Array<{ text: string, match: boolean }> = []
  let cursor = 0

  matches.forEach(({ offset, length }) => {
    if (offset > cursor)
      chunks.push({ text: text.slice(cursor, offset), match: false })

    chunks.push({ text: text.slice(offset, offset + length), match: true })
    cursor = offset + length
  })

  if (cursor < text.length) {
    chunks.push({ text: text.slice(cursor), match: false })
  }

  return chunks
}

defineExpose({
  clear: clearQuery,
  focus: focusInput,
})
</script>

<template>
  <div ref="containerRef">
    <UInput
      v-model="query"
      class="w-full"
      :placeholder="placeholder"
      size="xl"
      :disabled="!!scriptError"
      autocomplete="off"
      spellcheck="false"
      @focus="handleFocus"
      @keydown="handleKeydown"
    >
      <template #leading>
        <UIcon name="i-lucide-search" class="text-gray-500" />
      </template>
      <template #trailing>
        <UIcon
          v-if="isBusy"
          name="i-lucide-loader-circle"
          class="animate-spin text-gray-500"
        />
        <button
          v-else-if="query"
          type="button"
          class="-mr-1 inline-flex h-6 w-6 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
          @click="clearQuery"
        >
          <UIcon name="i-lucide-x" />
        </button>
      </template>
    </UInput>

    <transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0 -translate-y-1"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-100 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-1"
    >
      <div
        v-if="shouldShowDropdown"
        class="absolute left-0 right-0 z-10 mt-2 rounded-2xl border border-gray-200 bg-white shadow-xl"
      >
        <div class="max-h-80 overflow-y-auto py-2" role="listbox">
          <div
            v-if="scriptError"
            class="px-4 py-3 text-sm text-warn-600 flex flex-col gap-2"
          >
            <p>{{ scriptError }}</p>
            <UButton size="xs" variant="subtle" color="primary" @click="retryLoading">
              再試一次
            </UButton>
          </div>
          <div
            v-else-if="errorMessage"
            class="px-4 py-3 text-sm text-warn-600"
          >
            {{ errorMessage }}
          </div>
          <div
            v-else-if="showEmptyState"
            class="px-4 py-3 text-sm text-gray-500"
          >
            找不到與「{{ query }}」相符的地點。
          </div>
          <template v-else>
            <button
              v-for="(prediction, index) in predictions"
              :key="prediction.place_id"
              type="button"
              class="w-full px-4 py-3 text-left hover:bg-gray-100 focus-visible:outline-none"
              :class="index === highlightedIndex && 'bg-gray-100'"
              @mousedown.prevent="selectPrediction(prediction)"
            >
              <div class="text-sm font-medium text-gray-900">
                <span
                  v-for="(chunk, chunkIndex) in formatMainTextChunks(prediction)"
                  :key="chunkIndex"
                  :class="chunk.match ? 'text-primary-600' : ''"
                >
                  {{ chunk.text }}
                </span>
              </div>
              <div class="text-xs text-gray-500">
                {{ prediction.structured_formatting.secondary_text || prediction.description }}
              </div>
            </button>
          </template>
        </div>
        <div v-if="isBusy" class="flex items-center gap-2 border-t border-gray-100 px-4 py-2 text-xs text-gray-500">
          <UIcon name="i-lucide-loader-circle" class="animate-spin" />
          載入中…
        </div>
      </div>
    </transition>
  </div>
</template>
