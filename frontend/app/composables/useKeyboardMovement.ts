import { defaultWindow, useEventListener } from '@vueuse/core'

type MovementVector = [number, number]

export function useKeyboardMovement(
  applyMovement: (dx: number, dy: number) => void,
  movementStepPx = 10,
) {
  const movementByKey: Record<string, MovementVector> = {
    ArrowUp: [0, -movementStepPx],
    ArrowDown: [0, movementStepPx],
    ArrowLeft: [-movementStepPx, 0],
    ArrowRight: [movementStepPx, 0],
  }

  useEventListener(
    defaultWindow,
    'keydown',
    (event: KeyboardEvent) => {
      const movement = movementByKey[event.key]
      if (!movement)
        return

      event.preventDefault()
      applyMovement(movement[0], movement[1])
    },
    { passive: false },
  )
}
