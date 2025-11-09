const JOYSTICK_BASE_SPEED_PX = 2
const JOYSTICK_MAX_SPEED_PX = 4
const JOYSTICK_DEADZONE = 0.02

export function useVirtualJoyStick(onMove: (dx: number, dy: number) => void) {
  const isJoystickActive = ref(false)
  const joystickDirection = ref({ x: 0, y: 0 })

  let joystickFrame: number | null = null

  function stepJoystickMovement() {
    if (!isJoystickActive.value) {
      joystickFrame = null
      return
    }

    const direction = joystickDirection.value
    const magnitude = Math.hypot(direction.x, direction.y)
    if (magnitude >= JOYSTICK_DEADZONE) {
      const normalizedStrength = (magnitude - JOYSTICK_DEADZONE) / (1 - JOYSTICK_DEADZONE)
      const easedStrength = Math.min(normalizedStrength ** 1.35, 1)
      const speed =
        JOYSTICK_BASE_SPEED_PX +
        (JOYSTICK_MAX_SPEED_PX - JOYSTICK_BASE_SPEED_PX) * easedStrength

      onMove(direction.x * speed, direction.y * speed)
    }

    if (typeof window !== 'undefined')
      joystickFrame = window.requestAnimationFrame(stepJoystickMovement)
  }

  function startJoystickLoop() {
    if (joystickFrame !== null || typeof window === 'undefined')
      return
    joystickFrame = window.requestAnimationFrame(stepJoystickMovement)
  }

  function stopJoystickLoop() {
    if (joystickFrame !== null && typeof window !== 'undefined') {
      window.cancelAnimationFrame(joystickFrame)
      joystickFrame = null
    }
  }

  function handleJoystickMove(direction: { x: number, y: number }) {
    joystickDirection.value = direction
  }

  function handleJoystickActiveChange(active: boolean) {
    isJoystickActive.value = active
    if (active) {
      startJoystickLoop()
      return
    }

    stopJoystickLoop()
    joystickDirection.value = { x: 0, y: 0 }
  }

  onBeforeUnmount(() => {
    stopJoystickLoop()
  })

  return {
    isJoystickActive,
    handleJoystickMove,
    handleJoystickActiveChange,
  }
}
