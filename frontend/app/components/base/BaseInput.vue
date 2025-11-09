<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
  required?: boolean
  label?: string
  triggerValidate?: boolean
}>()

const inputValue = defineModel()

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
</script>

<template>
  <input
    v-model="inputValue"
    type="text"
    v-bind="$attrs"
    class="base-input"
    :class="{ 'base-input--warn': required && !isValidate }"
    @input="validate"
  >
  <p v-if="required && !isValidate" class="mt-2 text-right text-warn-200 text-sm">
    {{ props.label }}不能為空
  </p>
</template>

<style>
@reference "~/assets/css/main.css";

.base-input {
  @apply rounded-lg outline-none;
  @apply bg-gray-100;
  @apply p-2.5;

  &--warn {
    @apply border border-warn-200 text-warn-200;
    @apply placeholder:text-warn-200;
  }
}
</style>
