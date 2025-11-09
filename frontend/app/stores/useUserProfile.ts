interface UserProfile {
  points: number
  walkDistanceMeters: number
}

const DEFAULT_USER_PROFILE: UserProfile = {
  points: 0,
  walkDistanceMeters: 0,
}

const USER_PROFILE_STORAGE_KEY = 'sz-user-profile'

const useUserProfileState = createGlobalState(() => {
  const profile = useLocalStorage<UserProfile>(USER_PROFILE_STORAGE_KEY, { ...DEFAULT_USER_PROFILE }, {
    mergeDefaults: true,
  })

  function setPoints(points: number) {
    profile.value.points = Math.max(0, Math.round(points))
  }

  function addPoints(delta = 1) {
    setPoints(profile.value.points + delta)
  }

  function resetPoints() {
    setPoints(DEFAULT_USER_PROFILE.points)
  }

  function setWalkDistance(distanceMeters: number) {
    const safeDistance = Number.isFinite(distanceMeters) ? distanceMeters : 0
    const normalized = Number(safeDistance.toFixed(2))
    profile.value.walkDistanceMeters = Math.max(0, normalized)
  }

  function addWalkDistance(deltaMeters = 0) {
    if (!deltaMeters)
      return

    setWalkDistance(profile.value.walkDistanceMeters + deltaMeters)
  }

  function resetWalkDistance() {
    setWalkDistance(DEFAULT_USER_PROFILE.walkDistanceMeters)
  }

  return {
    profile,
    addPoints,
    setPoints,
    resetPoints,
    addWalkDistance,
    setWalkDistance,
    resetWalkDistance,
  }
})

export function useUserProfileStore() {
  return useUserProfileState()
}
