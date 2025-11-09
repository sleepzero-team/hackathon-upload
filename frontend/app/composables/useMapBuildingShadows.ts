/**
 * original: https://gist.github.com/ted-piotrowski/420a31bf3c157664fdda14bf45692785
 */

import type mapboxgl from 'mapbox-gl'
import * as SunCalc from 'suncalc'

type MapboxContext = WebGLRenderingContext & { currentNumAttributes?: number }

type MapboxMapInternals = mapboxgl.Map & {
  painter: { context: MapboxContext }
  style: (mapboxgl.Style & { _sourceCaches?: Record<string, SourceCache> }) | undefined
}

interface SourceCache {
  getVisibleCoordinates: () => Array<{
    overscaledZ: number
    projMatrix: Float32Array
  } & Record<string, any>>
  getTile: (coord: any) => any
}

class BuildingShadows implements mapboxgl.CustomLayerInterface {
  id = 'building-shadows'
  type = 'custom' as const
  date: Date

  private map: MapboxMapInternals | undefined
  private program!: WebGLProgram
  private opacityProgram!: WebGLProgram
  private uMatrix!: WebGLUniformLocation
  private uHeightFactor!: WebGLUniformLocation
  private uAltitude!: WebGLUniformLocation
  private uAzimuth!: WebGLUniformLocation
  private aPosNormalEd!: number
  private aBase!: number
  private aHeight!: number
  private aPos!: number
  private uTex!: WebGLUniformLocation
  private uAlt!: WebGLUniformLocation
  private shadeColor!: WebGLUniformLocation
  private buf!: WebGLBuffer
  private tex!: WebGLTexture
  private fb!: WebGLFramebuffer
  private attachmentPoint!: number
  private uMatrix2: WebGLUniformLocation | null = null
  private opacity = 0
  private viewportWidth = 0
  private viewportHeight = 0

  constructor(date: Date = new Date()) {
    this.date = date
  }

  updateDate(date: Date) {
    this.date = date
    this.map?.triggerRepaint()
  }

  onAdd(mapInstance: mapboxgl.Map, gl: WebGLRenderingContext) {
    this.map = mapInstance as MapboxMapInternals

    const vertexSource = `
        uniform mat4 u_matrix;
        uniform float u_height_factor;
        uniform float u_altitude;
        uniform float u_azimuth;
        attribute vec4 a_pos_normal_ed;
        attribute lowp vec2 a_base;
        attribute lowp vec2 a_height;
        void main() {
            float base = max(0.0, a_base.x);
            float height = max(0.0, a_height.x);
            vec4 pos_nx = floor(a_pos_normal_ed * 0.5);
            vec4 top_up_ny_start = a_pos_normal_ed - 2.0 * pos_nx;
            vec3 top_up_ny = top_up_ny_start.xyz;
            float t = top_up_ny.x;
            vec4 pos = vec4(pos_nx.xy, t > 0.0 ? height : base, 1);
            float len = pos.z * u_height_factor / tan(u_altitude);
            pos.x += cos(u_azimuth) * len;
            pos.y += sin(u_azimuth) * len;
            pos.z = 0.0;
            gl_Position = u_matrix * pos;
        }
      `
    const fragmentSource = `
        void main() {
            gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
        }
      `
    const vertexShader = gl.createShader(gl.VERTEX_SHADER)
    if (!vertexShader)
      throw new Error('Failed to create vertex shader')
    gl.shaderSource(vertexShader, vertexSource)
    gl.compileShader(vertexShader)

    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER)
    if (!fragmentShader)
      throw new Error('Failed to create fragment shader')
    gl.shaderSource(fragmentShader, fragmentSource)
    gl.compileShader(fragmentShader)

    const program = gl.createProgram()
    if (!program)
      throw new Error('Failed to create shader program')
    gl.attachShader(program, vertexShader)
    gl.attachShader(program, fragmentShader)
    gl.linkProgram(program)
    gl.validateProgram(program)

    this.program = program
    this.uMatrix = gl.getUniformLocation(program, 'u_matrix')!
    this.uHeightFactor = gl.getUniformLocation(program, 'u_height_factor')!
    this.uAltitude = gl.getUniformLocation(program, 'u_altitude')!
    this.uAzimuth = gl.getUniformLocation(program, 'u_azimuth')!
    this.aPosNormalEd = gl.getAttribLocation(program, 'a_pos_normal_ed')
    this.aBase = gl.getAttribLocation(program, 'a_base')
    this.aHeight = gl.getAttribLocation(program, 'a_height')

    this.compileOpacityProgram(gl)
  }

  private compileOpacityProgram(gl: WebGLRenderingContext) {
    const vertexSource = `
        attribute vec2 a_pos;
        varying vec2 v_pos;
        void main() {
            // texture vector position, range 0.0 - 1.0
            v_pos = a_pos * 0.5 + 0.5;
            gl_Position = vec4(a_pos, 0, 1);
        }
      `
    const fragmentSource = `
        precision mediump float;
        uniform sampler2D u_tex;
        uniform float u_alt;
        uniform vec4 u_shadeColor;
        varying vec2 v_pos;
        void main() {
            if (u_alt < 0.0) {
                gl_FragColor = u_shadeColor;
            } else {
                vec4 color = texture2D(u_tex, v_pos);
                if (color == vec4(0, 0, 0, 0)) {
                    gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
                } else {
                    gl_FragColor = u_shadeColor;
                }
            }
        }
      `
    const vertexShader = gl.createShader(gl.VERTEX_SHADER)
    if (!vertexShader)
      throw new Error('Failed to create vertex shader for opacity program')
    gl.shaderSource(vertexShader, vertexSource)
    gl.compileShader(vertexShader)

    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER)
    if (!fragmentShader)
      throw new Error('Failed to create fragment shader for opacity program')
    gl.shaderSource(fragmentShader, fragmentSource)
    gl.compileShader(fragmentShader)

    const program = gl.createProgram()
    if (!program)
      throw new Error('Failed to create opacity program')
    gl.attachShader(program, vertexShader)
    gl.attachShader(program, fragmentShader)
    gl.linkProgram(program)
    gl.validateProgram(program)

    this.opacityProgram = program
    this.aPos = gl.getAttribLocation(program, 'a_pos')
    this.uTex = gl.getUniformLocation(program, 'u_tex')!
    this.uAlt = gl.getUniformLocation(program, 'u_alt')!
    this.uMatrix2 = gl.getUniformLocation(program, 'u_matrix')
    this.shadeColor = gl.getUniformLocation(program, 'u_shadeColor')!

    const [_x, _y, vWidth, vHeight] = gl.getParameter(gl.VIEWPORT) as Int32Array

    const buffer = gl.createBuffer()
    if (!buffer)
      throw new Error('Failed to create vertex buffer')
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    const screen = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1])
    gl.bufferData(gl.ARRAY_BUFFER, screen, gl.STATIC_DRAW)
    this.buf = buffer

    const texture = gl.createTexture()
    if (!texture)
      throw new Error('Failed to create texture')
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, vWidth, vHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    this.tex = texture

    const framebuffer = gl.createFramebuffer()
    if (!framebuffer)
      throw new Error('Failed to create framebuffer')
    this.fb = framebuffer
    this.attachmentPoint = gl.COLOR_ATTACHMENT0
  }

  render(gl: WebGLRenderingContext, _matrix: number[]) {
    if (!this.map)
      return

    this.ensureTextureMatchesViewport(gl)

    gl.useProgram(this.program)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.tex)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, this.attachmentPoint, gl.TEXTURE_2D, this.tex, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)

    const style = this.map.style
    const sourceCache = style?._sourceCaches?.['other:composite'] as SourceCache | undefined
    if (!sourceCache)
      return

    const coords = (sourceCache.getVisibleCoordinates().slice().reverse()) as any[]
    const buildingsLayer = this.map.getLayer('3d-buildings')
    if (!buildingsLayer)
      return

    const context = this.map.painter.context
    const { lng, lat } = this.map.getCenter()
    const pos = SunCalc.getPosition(this.date, lat, lng)

    gl.uniform1f(this.uAltitude, pos.altitude)
    gl.uniform1f(this.uAzimuth, pos.azimuth + (3 * Math.PI) / 2)
    this.map.setLight({
      'anchor': 'map',
      'position': [1.5, 180 + (pos.azimuth * 180) / Math.PI, 90 - (pos.altitude * 180) / Math.PI],
      'position-transition': { duration: 0 },
      'color': pos.altitude < 0 ? '#999' : '#ffe',
    })

    this.opacity = Math.sin(Math.max(pos.altitude, 0)) * 0.5
    for (const coord of coords) {
      const tile = sourceCache.getTile(coord)
      if (!tile)
        continue

      const bucket = tile.getBucket(buildingsLayer)
      if (!bucket)
        continue

      const programConfig = bucket.programConfigurations.programConfigurations['3d-buildings']._buffers as [any, any]
      const [heightBuffer, baseBuffer] = programConfig

      gl.uniformMatrix4fv(this.uMatrix, false, coord.projMatrix)
      if (this.uMatrix2)
        gl.uniformMatrix4fv(this.uMatrix2, false, coord.projMatrix)

      gl.uniform1f(this.uHeightFactor, (2 ** coord.overscaledZ) / tile.tileSize / 8)

      for (const segment of bucket.segments.get()) {
        const numPrevAttrib = context.currentNumAttributes || 0
        const numNextAttrib = 2
        for (let i = numNextAttrib; i < numPrevAttrib; i++)
          gl.disableVertexAttribArray(i)

        const vertexOffset = segment.vertexOffset || 0
        gl.enableVertexAttribArray(this.aPosNormalEd)
        gl.enableVertexAttribArray(this.aHeight)
        gl.enableVertexAttribArray(this.aBase)
        bucket.layoutVertexBuffer.bind()
        gl.vertexAttribPointer(this.aPosNormalEd, 4, gl.SHORT, false, 8, 8 * vertexOffset)
        heightBuffer.bind()
        gl.vertexAttribPointer(this.aHeight, 1, gl.FLOAT, false, 4, 4 * vertexOffset)
        baseBuffer.bind()
        gl.vertexAttribPointer(this.aBase, 1, gl.FLOAT, false, 4, 4 * vertexOffset)
        bucket.indexBuffer.bind()
        context.currentNumAttributes = numNextAttrib
        gl.drawElements(gl.TRIANGLES, segment.primitiveLength * 3, gl.UNSIGNED_SHORT, segment.primitiveOffset * 3 * 2)
      }
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.useProgram(this.opacityProgram)
    gl.uniform1f(this.uAlt, pos.altitude)
    gl.uniform4fv(this.shadeColor, new Float32Array([0, 0, 0, 0.2]))
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf)
    gl.enableVertexAttribArray(this.aPos)
    gl.vertexAttribPointer(this.aPos, 2, gl.FLOAT, false, 0, 0)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  private ensureTextureMatchesViewport(gl: WebGLRenderingContext) {
    if (!this.tex)
      return
    const viewport = gl.getParameter(gl.VIEWPORT) as Int32Array
    const width = viewport[2]
    const height = viewport[3]
    if (!width || !height)
      return
    if (width === this.viewportWidth && height === this.viewportHeight)
      return

    const prevTexture = gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture | null
    gl.bindTexture(gl.TEXTURE_2D, this.tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    gl.bindTexture(gl.TEXTURE_2D, prevTexture)
    this.viewportWidth = width
    this.viewportHeight = height
  }
}

export function useMapBuildingShadows(map: mapboxgl.Map, date: MaybeRef<Date> = new Date(), options: { visible?: MaybeRef<boolean> } = {}): void {
  let shadowLayer: BuildingShadows | undefined
  const visible = options.visible ?? ref(true)

  map.on('load', () => {
    map.removeLayer('building')
    map.addLayer({
      'id': '3d-buildings',
      'source': 'composite',
      'source-layer': 'building',
      'type': 'fill-extrusion',
      'minzoom': 14,
      'paint': {
        'fill-extrusion-color': '#fff',
        'fill-extrusion-height': ['number', ['get', 'height'], 5],
        'fill-extrusion-base': ['number', ['get', 'min_height'], 0],
        'fill-extrusion-opacity': 0.8,
      },
    }, 'road-label')

    shadowLayer = new BuildingShadows(toValue(date))
    map.addLayer(shadowLayer, '3d-buildings')

    const applyVisibility = (value: boolean) => {
      if (!map.getLayer('building-shadows'))
        return
      map.setLayoutProperty('building-shadows', 'visibility', value ? 'visible' : 'none')
    }

    watch(() => toValue(visible), (isVisible) => {
      applyVisibility(isVisible)
    }, { immediate: true })
  })

  watch(toRef(date), (newDate) => {
    shadowLayer?.updateDate(newDate)
  })
}
