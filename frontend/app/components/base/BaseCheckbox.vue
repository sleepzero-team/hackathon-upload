<script setup lang="ts">
import type { BaseSelectOption } from './BaseSelect.vue'
import { ref, watch } from 'vue'

const props = defineProps<{
  option: BaseSelectOption
  required?: boolean
  triggerValidate?: boolean
}>()

const inputValue = defineModel<string[]>({ default: [] })

const isValidate = ref(true)

function validate() {
  isValidate.value = !!inputValue.value.length
}

watch(
  () => props.triggerValidate,
  () => {
    validate()
  },
)

const isInit = ref(false)

watch(
  () => inputValue.value,
  () => {
    if (!isInit.value) {
      isInit.value = true
    } else {
      validate()
    }
  },
)
</script>

<template>
  <label :for="props.option.value" class="flex items-center">
    <input
      :id="props.option.value"
      v-model="inputValue"
      type="checkbox"
      name=""
      :value="props.option.value"
      class="base-checkbox"
    >
    <div class="relative mr-1">
      <img v-if="required && !isValidate" src="@/assets/images/checkbox-warn.svg" class="w-5 h-5">
      <template v-else>
        <img src="@/assets/images/checkbox-default.svg" class="w-5 h-5">
        <img
          src="@/assets/images/checkbox-checked.svg"
          class="w-5 h-5 absolute inset-0 opacity-0"
        >
      </template>
    </div>
    <span>{{ props.option.label }}</span>
  </label>
</template>

<style>
@reference "~/assets/css/main.css";

.base-checkbox {
  @apply w-0 h-0 opacity-0 absolute;

  &:checked {
    & ~ div {
      & > img {
        &:first-child {
          @apply opacity-0;
          @apply transition-opacity;
        }

        &:last-child {
          @apply opacity-100;
          @apply transition-opacity;
        }
      }
    }
  }
}
</style>
