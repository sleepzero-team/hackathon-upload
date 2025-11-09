interface Settings {
  debugMode?: boolean | 'full'
  debugHideMap?: boolean
  pacmanModeEnabled?: boolean
  showToilets?: boolean
  showWaterDispensers?: boolean
  showBuildingShadows?: boolean
}

const _settings = useLocalStorage<Settings>('sz-settings', {
  debugMode: false,
  debugHideMap: false,
  pacmanModeEnabled: true,
  showToilets: false,
  showWaterDispensers: false,
  showBuildingShadows: true,
}, {
  mergeDefaults: true,
})

export function useSettings() {
  return _settings
}

export function cycleDebugModeSetting() {
  const debugMode = _settings.value.debugMode
  if (debugMode === false) {
    _settings.value.debugMode = true
  } else if (debugMode === true) {
    _settings.value.debugMode = 'full'
  } else {
    _settings.value.debugMode = false
  }
}
