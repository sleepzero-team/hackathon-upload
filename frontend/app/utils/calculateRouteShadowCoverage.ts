import * as SunCalc from 'suncalc'

const EARTH_RADIUS_METERS = 6_378_137

interface Point2D {
  x: number
  y: number
}

interface Bounds2D {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

interface ShadowPolygon {
  points: Point2D[]
  bounds: Bounds2D
}

interface LngLatPoint {
  lng: number
  lat: number
}

interface ShadowComputationContext {
  projector: ReturnType<typeof createLocalProjector>
  sunAltitude: number
  shadowDirection: Point2D
  maxShadowLength: number
  routeBounds: Bounds2D
  boundingPadding: number
}

export interface RouteShadowCoverageOptions {
  date?: Date
  sampleDistanceMeters?: number
  maxShadowLengthMeters?: number
  boundingPaddingMeters?: number
}

export interface RouteShadowCoverageResult {
  coveragePercent: number
  shadowedDistanceMeters: number
  totalDistanceMeters: number
}

export function calculateRouteShadowCoverage(
  map: mapboxgl.Map,
  route: mapboxgl.LngLatLike[],
  options: RouteShadowCoverageOptions = {},
): RouteShadowCoverageResult {
  if (!map || typeof map.queryRenderedFeatures !== 'function')
    throw new Error('A loaded Mapbox GL map instance is required to calculate route shadow coverage.')

  // if (!map.isStyleLoaded())
  // throw new Error('Map style must be fully loaded before calculating route shadow coverage.')

  if (!route.length)
    return { coveragePercent: 0, totalDistanceMeters: 0, shadowedDistanceMeters: 0 }

  const normalizedRoute: LngLatPoint[] = route.map(normalizeLngLat)
  const totalDistanceMeters = computeRouteDistance(normalizedRoute)

  if (totalDistanceMeters === 0)
    return { coveragePercent: 0, totalDistanceMeters: 0, shadowedDistanceMeters: 0 }

  const referencePoint = computeRouteCentroid(normalizedRoute)
  const date = options.date ?? new Date()
  const sunPosition = SunCalc.getPosition(date, referencePoint.lat, referencePoint.lng)

  if (sunPosition.altitude <= 0) {
    return {
      coveragePercent: 100,
      totalDistanceMeters,
      shadowedDistanceMeters: totalDistanceMeters,
    }
  }

  const shadowBearing = computeShadowBearingDegrees(sunPosition.azimuth)
  const shadowDirection = bearingToUnitVector(shadowBearing)
  const sampleDistance = Math.max(0.5, options.sampleDistanceMeters ?? 5)
  const maxShadowLength = Math.max(sampleDistance, options.maxShadowLengthMeters ?? 250)
  const boundingPadding = Math.max(sampleDistance, options.boundingPaddingMeters ?? 20)

  const projector = createLocalProjector(referencePoint)
  const routeLocalPoints = normalizedRoute.map(point => projector.toLocal(point))
  const routeBounds = computeBounds(routeLocalPoints)

  const renderedFeatures = map.queryRenderedFeatures(undefined, { layers: ['3d-buildings'] }) as mapboxgl.MapboxGeoJSONFeature[]
  const shadowPolygons = buildShadowPolygons(renderedFeatures, {
    projector,
    sunAltitude: sunPosition.altitude,
    shadowDirection,
    maxShadowLength,
    routeBounds,
    boundingPadding,
  })

  if (!shadowPolygons.length) {
    return { coveragePercent: 0, totalDistanceMeters, shadowedDistanceMeters: 0 }
  }

  let shadowedDistanceMeters = 0

  for (let segmentIndex = 0; segmentIndex < normalizedRoute.length - 1; segmentIndex += 1) {
    const start = normalizedRoute[segmentIndex]
    const end = normalizedRoute[segmentIndex + 1]
    const segmentLength = haversineDistance(start, end)
    if (segmentLength === 0)
      continue

    const steps = Math.max(1, Math.ceil(segmentLength / sampleDistance))
    const startLocal = routeLocalPoints[segmentIndex]
    const endLocal = routeLocalPoints[segmentIndex + 1]

    for (let step = 0; step < steps; step += 1) {
      const midpointFraction = (step + 0.5) / steps
      const subSegmentLength = segmentLength / steps
      const samplePoint: Point2D = {
        x: startLocal.x + (endLocal.x - startLocal.x) * midpointFraction,
        y: startLocal.y + (endLocal.y - startLocal.y) * midpointFraction,
      }

      if (isPointShadowed(samplePoint, shadowPolygons))
        shadowedDistanceMeters += subSegmentLength
    }
  }

  const coveragePercent = clamp(
    (shadowedDistanceMeters / totalDistanceMeters) * 100,
    0,
    100,
  )

  return {
    coveragePercent,
    totalDistanceMeters,
    shadowedDistanceMeters,
  }
}

function normalizeLngLat(input: mapboxgl.LngLatLike): LngLatPoint {
  if (Array.isArray(input)) {
    const [lng, lat] = input
    return { lng, lat }
  }
  if (typeof input === 'object' && input !== null) {
    const maybeLng = (input as { lng?: number }).lng
    const maybeLat = (input as { lat?: number }).lat
    if (typeof maybeLng === 'number' && typeof maybeLat === 'number')
      return { lng: maybeLng, lat: maybeLat }

    const maybeLon = (input as { lon?: number }).lon
    if (typeof maybeLon === 'number' && typeof maybeLat === 'number')
      return { lng: maybeLon, lat: maybeLat }

    const toArray = (input as { toArray?: () => [number, number] }).toArray
    if (typeof toArray === 'function') {
      const [lng, lat] = toArray.call(input)
      return { lng, lat }
    }
  }
  throw new Error('Invalid LngLatLike coordinate.')
}

function computeRouteCentroid(route: LngLatPoint[]): LngLatPoint {
  let lngSum = 0
  let latSum = 0
  for (const point of route) {
    lngSum += point.lng
    latSum += point.lat
  }

  return {
    lng: lngSum / route.length,
    lat: latSum / route.length,
  }
}

function computeRouteDistance(route: LngLatPoint[]): number {
  let total = 0
  for (let index = 0; index < route.length - 1; index += 1)
    total += haversineDistance(route[index], route[index + 1])
  return total
}

function haversineDistance(a: LngLatPoint, b: LngLatPoint): number {
  const toRad = (value: number) => (value * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)

  const sinLat = Math.sin(dLat / 2)
  const sinLon = Math.sin(dLon / 2)

  const c = 2 * Math.atan2(
    Math.sqrt(sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon),
    Math.sqrt(1 - (sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon)),
  )

  return EARTH_RADIUS_METERS * c
}

function createLocalProjector(origin: LngLatPoint) {
  const originLatRad = (origin.lat * Math.PI) / 180

  return {
    toLocal(point: LngLatPoint): Point2D {
      const dLat = (point.lat - origin.lat) * (Math.PI / 180)
      const dLon = (point.lng - origin.lng) * (Math.PI / 180)
      return {
        x: dLon * Math.cos(originLatRad) * EARTH_RADIUS_METERS,
        y: dLat * EARTH_RADIUS_METERS,
      }
    },
  }
}

function computeBounds(points: Point2D[]): Bounds2D {
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (const point of points) {
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  }

  return { minX, minY, maxX, maxY }
}

function expandBounds(bounds: Bounds2D, paddingX: number, paddingY: number): Bounds2D {
  return {
    minX: bounds.minX - paddingX,
    minY: bounds.minY - paddingY,
    maxX: bounds.maxX + paddingX,
    maxY: bounds.maxY + paddingY,
  }
}

function overlapBounds(a: Bounds2D, b: Bounds2D): boolean {
  return (
    a.maxX >= b.minX
    && a.minX <= b.maxX
    && a.maxY >= b.minY
    && a.minY <= b.maxY
  )
}

function pointInPolygon(point: Point2D, polygon: Point2D[]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = polygon[i].x
    const yi = polygon[i].y
    const xj = polygon[j].x
    const yj = polygon[j].y

    if ((yi > point.y) !== (yj > point.y)) {
      const denominator = yj - yi
      if (denominator !== 0) {
        const xIntersection = ((xj - xi) * (point.y - yi)) / denominator + xi
        if (point.x < xIntersection)
          inside = !inside
      }
    }
  }
  return inside
}

function isPointShadowed(point: Point2D, polygons: ShadowPolygon[]): boolean {
  for (const polygon of polygons) {
    if (
      point.x < polygon.bounds.minX
      || point.x > polygon.bounds.maxX
      || point.y < polygon.bounds.minY
      || point.y > polygon.bounds.maxY
    ) {
      continue
    }

    if (pointInPolygon(point, polygon.points)) {
      return true
    }
  }

  return false
}

function buildShadowPolygons(
  features: mapboxgl.MapboxGeoJSONFeature[],
  context: ShadowComputationContext,
): ShadowPolygon[] {
  const uniqueFeatures = deduplicateFeatures(features)
  const polygons: ShadowPolygon[] = []
  const tanAltitude = Math.tan(context.sunAltitude)

  for (const feature of uniqueFeatures) {
    const buildingHeight = resolveBuildingHeight(feature)
    if (buildingHeight <= 0)
      continue

    const shadowLength = Math.min(context.maxShadowLength, buildingHeight / Math.max(tanAltitude, 1e-3))
    if (!Number.isFinite(shadowLength) || shadowLength <= 0)
      continue

    const shiftVector = {
      x: context.shadowDirection.x * shadowLength,
      y: context.shadowDirection.y * shadowLength,
    }

    for (const ring of extractPolygonRings(feature)) {
      if (!ring.length)
        continue

      const localPoints = ring
        .slice(0, -1) // avoid duplicated closing coordinate
        .map(([lng, lat]) => context.projector.toLocal({ lng, lat }))
      if (localPoints.length < 3)
        continue

      const footprintBounds = computeBounds(localPoints)
      const expandedBounds = expandBounds(
        footprintBounds,
        Math.abs(shiftVector.x) + context.boundingPadding,
        Math.abs(shiftVector.y) + context.boundingPadding,
      )

      if (!overlapBounds(expandedBounds, context.routeBounds))
        continue

      const shadowHull = computeShadowHull(localPoints, shiftVector)
      if (shadowHull.length < 3)
        continue

      polygons.push({
        points: shadowHull,
        bounds: computeBounds(shadowHull),
      })
    }
  }

  return polygons
}

function extractPolygonRings(feature: mapboxgl.MapboxGeoJSONFeature): [number, number][][] {
  const geometry = feature.geometry
  if (!geometry)
    return []

  if (geometry.type === 'Polygon')
    return (geometry.coordinates as GeoJSON.Position[][]).map(ring => ring as [number, number][])

  if (geometry.type === 'MultiPolygon')
    return (geometry.coordinates as GeoJSON.Position[][][]).flat(1).map(ring => ring as [number, number][])

  return []
}

function resolveBuildingHeight(feature: mapboxgl.MapboxGeoJSONFeature): number {
  const rawHeight = toNumber(feature.properties?.height, Number.NaN)
  const rawMinHeight = toNumber(feature.properties?.min_height, 0)

  const fallbackHeight = 5
  const height = Number.isFinite(rawHeight) ? rawHeight : fallbackHeight
  const minHeight = Number.isFinite(rawMinHeight) ? rawMinHeight : 0

  return Math.max(0, height - minHeight)
}

function toNumber(value: unknown, fallback: number): number {
  if (value == null)
    return fallback
  const num = typeof value === 'string' ? Number.parseFloat(value) : Number(value)
  return Number.isFinite(num) ? num : fallback
}

function deduplicateFeatures(features: mapboxgl.MapboxGeoJSONFeature[]): mapboxgl.MapboxGeoJSONFeature[] {
  const seen = new Map<string, mapboxgl.MapboxGeoJSONFeature>()

  features.forEach((feature, index) => {
    const keyParts = [
      feature.source,
      feature.sourceLayer,
      feature.id,
      feature.properties?.id,
      feature.properties?.osm_id,
    ].filter(value => value !== undefined)

    if (!keyParts.length)
      keyParts.push(`idx-${index}`)

    const key = keyParts.join(':')

    if (!seen.has(key))
      seen.set(key, feature)
  })

  return Array.from(seen.values())
}

function computeShadowHull(points: Point2D[], shift: Point2D): Point2D[] {
  const shiftedPoints = points.map(point => ({
    x: point.x + shift.x,
    y: point.y + shift.y,
  }))

  const allPoints = [...points, ...shiftedPoints]
  return monotonicHull(allPoints)
}

function monotonicHull(points: Point2D[]): Point2D[] {
  if (points.length < 3)
    return points.slice()

  const sorted = points
    .slice()
    .sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x))

  const cross = (o: Point2D, a: Point2D, b: Point2D) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)

  const lower: Point2D[] = []
  for (const point of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0)
      lower.pop()
    lower.push(point)
  }

  const upper: Point2D[] = []
  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const point = sorted[index]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0)
      upper.pop()
    upper.push(point)
  }

  lower.pop()
  upper.pop()

  return [...lower, ...upper]
}

function computeShadowBearingDegrees(sunAzimuthRad: number): number {
  const sunBearing = (radToDeg(sunAzimuthRad) + 180 + 360) % 360
  return (sunBearing + 180) % 360
}

function bearingToUnitVector(bearingDegrees: number): Point2D {
  const rad = (bearingDegrees * Math.PI) / 180
  return {
    x: Math.sin(rad),
    y: Math.cos(rad),
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function radToDeg(value: number): number {
  return (value * 180) / Math.PI
}
