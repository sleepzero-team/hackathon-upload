export default defineNuxtPlugin(() => {
  if (typeof window === 'undefined')
    return

  const updateViewportHeight = () => {
    const viewportHeight = window.innerHeight
    document.documentElement.style.setProperty('--app-viewport-height', `${viewportHeight}px`)
  }

  updateViewportHeight()

  window.addEventListener('resize', updateViewportHeight, { passive: true })
  window.addEventListener('orientationchange', updateViewportHeight)
})
