<script setup lang="ts">
import type { PlaceAutocompleteSelection } from '~/types'
import MapView from '~/components/MapView.vue'
import PlaceAutocomplete from '~/components/PlaceAutocomplete.vue'
import { useGameGeolocation } from '~/composables/useGameGeolocation'
import { useProvideGameStore } from '~/stores/useGameStore'

const { playerPosition } = useGameGeolocation()

useProvideGameStore({
  playerPosition,
})

function handlePlaceSelect(place: PlaceAutocompleteSelection): void {
  // eslint-disable-next-line no-console
  console.log('place selected', place)
}
</script>

<template>
  <div
    class="relative w-full overflow-hidden"
    style="height: var(--app-viewport-height, 100vh);"
  >
    <MapView class="h-full w-full" />
    <PlaceAutocomplete class="absolute top-4 left-4 right-4" @select="handlePlaceSelect" />
  </div>
</template>
