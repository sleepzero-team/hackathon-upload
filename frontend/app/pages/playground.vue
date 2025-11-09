<script setup lang="ts">

</script>

<template>
  <div>
    <div class="bg-red-500 text-2xl">
      123
    </div>
    <BaseButton>
      Click Me
    </BaseButton>
    <UButton>
      Click Me
    </UButton>
    <BaseSelect
      select-id="1"
      :options="[
        { label: 'Option 1', value: '1' },
        { label: 'Option 2', value: '2' },
      ]"
      default-selected="Please select"
      required
    />
  </div>
</template>
