<script setup lang="ts">
import { ref, watch } from 'vue'

export interface BaseSelectOption {
  label: string
  value: string
}

const props = defineProps<{
  options?: BaseSelectOption[]
  defaultSelected?: string
  selectId: string
  required?: boolean
  triggerValidate?: boolean
  customClass?: string
}>()

const inputValue = defineModel({ default: '' })

const isValidate = ref(true)

function validate() {
  isValidate.value = !!inputValue.value
}

watch(
  () => props.triggerValidate,
  () => {
    validate()
  },
)

watch(inputValue, () => {
  validate()
})
</script>

<template>
  <div class="base-select-wrapper">
    <select
      v-bind="$attrs"
      :id="props.selectId"
      v-model="inputValue"
      class="base-select"
      :class="[{ 'base-select--warn': props.required && !isValidate }, props.customClass]"
    >
      <option v-if="props.defaultSelected" value="" selected>
        {{ props.defaultSelected }}
      </option>
      <option v-for="option in props.options" :key="option.value" :value="option.value">
        {{ option.label }}
      </option>
    </select>
  </div>
</template>

<style>
@reference "~/assets/css/main.css";

.base-select-wrapper {
  @apply relative;
  @apply after:content-[''] after:w-6 after:h-6;
  @apply after:bg-[url('@/assets/images/down-icon.svg')] after:bg-cover after:bg-no-repeat;
  @apply after:block after:absolute after:top-1/2 after:-translate-y-1/2 after:right-2;
}

.base-select {
  @apply relative;
  @apply rounded-lg outline-none;
  @apply bg-gray-100;
  @apply p-3;
  @apply appearance-none;
  @apply w-full;

  &--warn {
    @apply border border-warn-200 text-warn-200;

    & > option {
      @apply text-warn-200;
    }
  }
}
</style>
