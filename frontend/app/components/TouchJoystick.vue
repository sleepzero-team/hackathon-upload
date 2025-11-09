<script setup lang="ts">
const emit = defineEmits<{
  move: [direction: { x: number, y: number }]
  activeChange: [isActive: boolean]
}>()

const baseRef = ref<HTMLDivElement | null>(null)

const state = reactive({
  pointerId: null as number | null,
  isActive: false,
  offsetX: 0,
  offsetY: 0,
})

function resetJoystick() {
  const wasActive = state.isActive
  state.isActive = false
  state.pointerId = null
  state.offsetX = 0
  state.offsetY = 0
  emit('move', { x: 0, y: 0 })
  if (wasActive)
    emit('activeChange', false)
}

function clampHandle(rect: DOMRect, clientX: number, clientY: number) {
  const radius = rect.width / 2
  const centerX = rect.left + radius
  const centerY = rect.top + radius

  const dx = clientX - centerX
  const dy = clientY - centerY
  const distance = Math.hypot(dx, dy)

  if (distance <= radius) {
    state.offsetX = dx
    state.offsetY = dy
    return
  }

  const scale = radius / distance
  state.offsetX = dx * scale
  state.offsetY = dy * scale
}

function emitDirection() {
  const element = baseRef.value
  if (!element)
    return

  const radius = element.clientWidth / 2
  if (radius <= 0)
    return

  const directionX = state.offsetX / radius
  const directionY = state.offsetY / radius
  emit('move', { x: directionX, y: directionY })
}

function onPointerDown(event: PointerEvent) {
  if (state.pointerId !== null)
    return

  const element = baseRef.value
  if (!element)
    return

  element.setPointerCapture(event.pointerId)
  const rect = element.getBoundingClientRect()

  state.pointerId = event.pointerId
  state.isActive = true
  emit('activeChange', true)
  clampHandle(rect, event.clientX, event.clientY)
  emitDirection()
}

function onPointerMove(event: PointerEvent) {
  if (!state.isActive || event.pointerId !== state.pointerId)
    return

  const element = baseRef.value
  if (!element)
    return

  const rect = element.getBoundingClientRect()
  clampHandle(rect, event.clientX, event.clientY)
  emitDirection()
}

function onPointerEnd(event: PointerEvent) {
  if (event.pointerId !== state.pointerId)
    return

  const element = baseRef.value
  if (element)
    element.releasePointerCapture(event.pointerId)

  resetJoystick()
}

onBeforeUnmount(() => {
  resetJoystick()
})
</script>

<template>
  <div
    ref="baseRef"
    class="pointer-events-auto flex h-20 w-20 select-none items-center justify-center rounded-full bg-black/40 backdrop-blur touch-none"
    @pointerdown.prevent="onPointerDown"
    @pointermove.prevent="onPointerMove"
    @pointerup.prevent="onPointerEnd"
    @pointercancel.prevent="onPointerEnd"
  >
    <div
      class="flex h-14 w-14 items-center justify-center rounded-full bg-white/20 shadow-inner transition-transform duration-75 ease-out will-change-transform"
      :style="{
        transform: `translate(${state.offsetX}px, ${state.offsetY}px)`,
      }"
    >
      <div class="h-6 w-6 rounded-full bg-white/70 shadow" />
    </div>
  </div>
</template>
