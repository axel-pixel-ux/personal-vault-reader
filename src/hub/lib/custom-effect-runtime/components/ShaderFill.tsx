import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type JSX } from 'react'

import type { Shader, HtmlInCanvasElement } from '../types.js'
import { useProcessMaskUrl } from '../mask.js'
import { useShaderRuntime } from '../useShaderRuntime.js'

export type ShaderFillProps = {
  shader: Shader
  width?: number
  height?: number
  className?: string
  style?: CSSProperties
  // A CSS `mask` value (e.g. `url("…")`) clipping the canvas to the node's vector shape.
  mask?: string
}

const VERTEX_SHADER_GLSL = `
attribute vec2 a_pos;
attribute vec2 a_uv;
varying vec2 v_uv;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
  v_uv = a_uv;
}
`

const FRAGMENT_SHADER_GLSL = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 v_uv;

uniform float u_time;
uniform vec2 u_dims;
uniform vec4 u_color1;
uniform vec4 u_color2;
uniform vec4 u_color3;
uniform vec4 u_color4;
uniform float u_seed;
uniform float u_speed;
uniform float u_featureScale;
uniform float u_amplitude;
uniform float u_frequency;
uniform float u_definition;
uniform float u_bands;
uniform float u_grain;
uniform float u_exposure;
uniform float u_contrastAmt;
uniform float u_saturation;

float safeAtan2(float y, float x) {
  if (abs(x) < 0.00001 && abs(y) < 0.00001) {
    return 0.0;
  }
  return atan(y, x);
}

float srgbToLinear(float c) {
  if (c <= 0.04045) return c / 12.92;
  return pow((c + 0.055) / 1.055, 2.4);
}

float linearToSrgb(float c) {
  if (c <= 0.0031308) return c * 12.92;
  return 1.055 * pow(c, 1.0 / 2.4) - 0.055;
}

vec3 srgb3ToLinear(vec3 c) {
  return vec3(srgbToLinear(c.x), srgbToLinear(c.y), srgbToLinear(c.z));
}

vec3 linear3ToSrgb(vec3 c) {
  return vec3(linearToSrgb(c.x), linearToSrgb(c.y), linearToSrgb(c.z));
}

vec3 linearToOklab(vec3 c) {
  float l = 0.4122214708 * c.x + 0.5363325363 * c.y + 0.0514459929 * c.z;
  float m = 0.2119034982 * c.x + 0.6806995451 * c.y + 0.1073969566 * c.z;
  float s = 0.0883024619 * c.x + 0.2817188376 * c.y + 0.6299787005 * c.z;
  float l_ = pow(max(l, 0.0), 1.0 / 3.0);
  float m_ = pow(max(m, 0.0), 1.0 / 3.0);
  float s_ = pow(max(s, 0.0), 1.0 / 3.0);
  return vec3(
    0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
  );
}

vec3 oklabToLinear(vec3 c) {
  float l_ = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
  float m_ = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
  float s_ = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
  float l = l_ * l_ * l_;
  float m = m_ * m_ * m_;
  float s = s_ * s_ * s_;
  return vec3(
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
  );
}

vec3 oklabToLch(vec3 lab) {
  float C = sqrt(lab.y * lab.y + lab.z * lab.z);
  float h = safeAtan2(lab.z, lab.y);
  return vec3(lab.x, C, h);
}

vec3 lchToOklab(vec3 lch) {
  return vec3(lch.x, lch.y * cos(lch.z), lch.y * sin(lch.z));
}

vec3 mixOklch(vec3 a, vec3 b, float t) {
  vec3 labA = linearToOklab(a);
  vec3 labB = linearToOklab(b);
  vec3 lchA = oklabToLch(labA);
  vec3 lchB = oklabToLch(labB);
  float L = mix(lchA.x, lchB.x, t);
  float C = mix(lchA.y, lchB.y, t);
  float dh = lchB.z - lchA.z;
  if (dh > 3.14159265) dh -= 6.28318530;
  if (dh < -3.14159265) dh += 6.28318530;
  float h = lchA.z + dh * t;
  return oklabToLinear(lchToOklab(vec3(L, C, h)));
}

float safeTanh(float x) {
  float cx = clamp(x, -10.0, 10.0);
  float e2x = exp(2.0 * cx);
  return (e2x - 1.0) / (e2x + 1.0);
}

void main() {
  vec2 uv = v_uv;
  vec2 dims = max(u_dims, vec2(1.0));
  float aspect = dims.x / max(dims.y, 1.0);
  float T = u_time * 0.001 * 0.3 * u_speed;

  vec2 p0 = vec2((uv.x * 2.0 - 1.0) * aspect, -(uv.y * 2.0 - 1.0));
  float ang = u_seed * 2.3999632;
  float ca = cos(ang);
  float sa = sin(ang);
  vec2 p = vec2(ca * p0.x + sa * p0.y, -sa * p0.x + ca * p0.y) * u_featureScale;

  vec3 so = vec3(0.185610, 0.435062, 0.842443);
  vec3 so2 = vec3(0.640671, 0.186654, 0.946699);
  vec2 q = p;
  float a_acc = 0.883862;
  float d_acc = -1.968811;

  for (int j = 2; j < 13; j++) {
    if (float(j) >= u_definition) break;
    float fj = float(j);
    q = q + u_amplitude * sin(q.yx * u_frequency * fj + T + vec2(a_acc, d_acc) + so.xy * fj) / fj;
    a_acc = a_acc + cos(fj + d_acc * 1.2 + q.x * 2.0 - T + so2.z);
    d_acc = d_acc + sin(fj * q.y + a_acc + so.z + T + so2.y);
  }

  float L = length(q.yx + vec2(a_acc, d_acc) * 0.2) * u_bands + so.x;
  float s1 = 0.5 + 0.5 * sin(L + 1.0);
  float s2 = 0.5 + 0.5 * sin(L + 4.0);
  float s3 = 0.5 + 0.5 * sin(L + 9.0);
  float val = (s1 * 0.5 + s2 + s3 * 0.5) * 0.5;
  val = clamp((val - 0.3) / 0.4, 0.0, 1.0);

  vec2 pix = floor(uv * dims);
  float ign = fract(52.9829189 * fract(dot(pix, vec2(0.06711056, 0.00583715))));
  val = clamp(val + (ign - 0.5) * u_grain, 0.0, 1.0);

  vec3 lin1 = srgb3ToLinear(u_color1.rgb);
  vec3 lin2 = srgb3ToLinear(u_color2.rgb);
  vec3 lin3 = srgb3ToLinear(u_color3.rgb);
  vec3 lin4 = srgb3ToLinear(u_color4.rgb);

  vec3 col;
  if (val < 0.333333) {
    col = mixOklch(lin1, lin2, val * 3.0);
  } else if (val < 0.666667) {
    col = mixOklch(lin2, lin3, (val - 0.333333) * 3.0);
  } else {
    col = mixOklch(lin3, lin4, (val - 0.666667) * 3.0);
  }

  col = col * u_exposure;
  vec3 lab = linearToOklab(col);
  lab = vec3(clamp((lab.x - 0.5) * u_contrastAmt + 0.5, 0.0, 1.0), lab.y * u_saturation, lab.z * u_saturation);
  col = oklabToLinear(lab);

  float mx = max(col.x, max(col.y, col.z));
  float mn = min(col.x, min(col.y, col.z));
  if (mn < 0.0 || mx > 1.0) {
    vec3 g = linearToOklab(max(col, vec3(0.0)));
    float gl = clamp(g.x, 0.0, 1.0);
    float gc = length(g.yz);
    float gh = safeAtan2(g.z, g.y);
    float maxC = 0.4 * (1.0 - pow(abs(2.0 * gl - 1.0), 2.0));
    float knee = maxC * 0.7;
    if (gc > knee) {
      gc = knee + (maxC - knee) * safeTanh((gc - knee) / (maxC - knee + 0.001));
    }
    col = clamp(oklabToLinear(vec3(gl, gc * cos(gh), gc * sin(gh))), vec3(0.0), vec3(1.0));
  }

  col = linear3ToSrgb(clamp(col, vec3(0.0), vec3(1.0)));
  gl_FragColor = vec4(col, 1.0);
}
`

function WebGLShaderFallback({
  shader,
  className,
  style,
}: {
  shader: Shader
  className?: string
  style?: CSSProperties
}): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let rafId = 0
    let cleanupGl: (() => void) | null = null

    try {
      const gl = (canvas.getContext('webgl2') ||
        canvas.getContext('webgl') ||
        canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null
      if (!gl) return

      const compile = (type: number, src: string) => {
        const s = gl.createShader(type)
        if (!s) return null
        gl.shaderSource(s, src)
        gl.compileShader(s)
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
          gl.deleteShader(s)
          return null
        }
        return s
      }

      const vs = compile(gl.VERTEX_SHADER, VERTEX_SHADER_GLSL)
      const fs = compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER_GLSL)
      if (!vs || !fs) return

      const prog = gl.createProgram()
      if (!prog) return
      gl.attachShader(prog, vs)
      gl.attachShader(prog, fs)
      gl.linkProgram(prog)
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return

      const buf = gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, buf)
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([
          -1, -1, 0, 1,
          1, -1, 1, 1,
          -1, 1, 0, 0,
          -1, 1, 0, 0,
          1, -1, 1, 1,
          1, 1, 1, 0,
        ]),
        gl.STATIC_DRAW,
      )

      const posLoc = gl.getAttribLocation(prog, 'a_pos')
      const uvLoc = gl.getAttribLocation(prog, 'a_uv')
      if (posLoc >= 0) {
        gl.enableVertexAttribArray(posLoc)
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 16, 0)
      }
      if (uvLoc >= 0) {
        gl.enableVertexAttribArray(uvLoc)
        gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 16, 8)
      }

      const p = shader.params || {}
      const num = (key: string, fb: number) => {
        const v = Number(p[key])
        return Number.isFinite(v) ? v : fb
      }
      const col = (key: string, fb: [number, number, number, number]) => {
        const c = (p[key] || {}) as Record<string, unknown>
        return [
          Number.isFinite(Number(c.r)) ? Number(c.r) : fb[0],
          Number.isFinite(Number(c.g)) ? Number(c.g) : fb[1],
          Number.isFinite(Number(c.b)) ? Number(c.b) : fb[2],
          Number.isFinite(Number(c.a)) ? Number(c.a) : fb[3],
        ]
      }

      let startTs: number | null = null

      const renderFrame = (ts: number) => {
        try {
          if (startTs === null) startTs = ts
          const elapsed = ts - startTs
          const dpr = Math.min(window.devicePixelRatio || 1, 1.75)
          const rect = canvas.getBoundingClientRect()
          const w = Math.max(1, Math.round((rect.width || window.innerWidth || 360) * dpr))
          const h = Math.max(1, Math.round((rect.height || window.innerHeight || 640) * dpr))
          if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w
            canvas.height = h
          }

          gl.viewport(0, 0, w, h)
          gl.useProgram(prog)
          gl.uniform1f(gl.getUniformLocation(prog, 'u_time'), elapsed)
          gl.uniform2f(gl.getUniformLocation(prog, 'u_dims'), w, h)
          const c1 = col('color1', [0.1254902, 0.1254902, 0.1254902, 1])
          const c2 = col('color2', [0.8705882, 0.8705882, 0.8705882, 1])
          const c3 = col('color3', [0.3921569, 0.3921569, 0.3921569, 1])
          const c4 = col('color4', [0.8078431, 0.8078431, 0.8078431, 1])
          gl.uniform4f(gl.getUniformLocation(prog, 'u_color1'), c1[0], c1[1], c1[2], c1[3])
          gl.uniform4f(gl.getUniformLocation(prog, 'u_color2'), c2[0], c2[1], c2[2], c2[3])
          gl.uniform4f(gl.getUniformLocation(prog, 'u_color3'), c3[0], c3[1], c3[2], c3[3])
          gl.uniform4f(gl.getUniformLocation(prog, 'u_color4'), c4[0], c4[1], c4[2], c4[3])
          gl.uniform1f(gl.getUniformLocation(prog, 'u_seed'), num('seed', 348))
          gl.uniform1f(gl.getUniformLocation(prog, 'u_speed'), num('speed', 1.6))
          gl.uniform1f(gl.getUniformLocation(prog, 'u_featureScale'), num('featureScale', 0.53))
          gl.uniform1f(gl.getUniformLocation(prog, 'u_amplitude'), num('amplitude', 0))
          gl.uniform1f(gl.getUniformLocation(prog, 'u_frequency'), num('frequency', 0.92))
          gl.uniform1f(gl.getUniformLocation(prog, 'u_definition'), num('definition', 6))
          gl.uniform1f(gl.getUniformLocation(prog, 'u_bands'), num('bands', 1.7))
          gl.uniform1f(gl.getUniformLocation(prog, 'u_grain'), num('grain', 0.04))
          gl.uniform1f(gl.getUniformLocation(prog, 'u_exposure'), num('exposure', 1))
          gl.uniform1f(gl.getUniformLocation(prog, 'u_contrastAmt'), num('contrastAmt', 1.2))
          gl.uniform1f(gl.getUniformLocation(prog, 'u_saturation'), num('saturation', 1))

          gl.drawArrays(gl.TRIANGLES, 0, 6)
        } catch {
          // Ignorer les erreurs transitoires de frame
        }
        rafId = requestAnimationFrame(renderFrame)
      }

      rafId = requestAnimationFrame(renderFrame)
      cleanupGl = () => {
        try {
          gl.deleteBuffer(buf)
          gl.deleteProgram(prog)
          gl.deleteShader(vs)
          gl.deleteShader(fs)
        } catch {
          // Ignorer
        }
      }
    } catch {
      // Le fond CSS métallique animé prend le relais si WebGL est indisponible
    }

    return () => {
      if (rafId) cancelAnimationFrame(rafId)
      if (cleanupGl) cleanupGl()
    }
  }, [shader])

  return <canvas ref={canvasRef} className={className} style={style} />
}

export function ShaderFill({
  shader,
  width,
  height,
  className,
  style,
  mask,
}: ShaderFillProps): JSX.Element | null {
  const [canvas, setCanvas] = useState<HtmlInCanvasElement | null>(null)
  // Keep the array identity stable so the runtime's setup effect doesn't re-run each render.
  const shaders = useMemo(() => [shader], [shader])
  const { error } = useShaderRuntime({ canvas, shaders, hasChildren: false })
  const processedMask = useProcessMaskUrl(mask)

  // Stable ref callback — an inline arrow would re-bind every render, which can cause
  // React to call the callback with null then with the canvas on each commit, tearing
  // down and re-acquiring the WebGPU device.
  const canvasRef = useCallback((ref: HTMLCanvasElement | null) => {
    setCanvas(ref as unknown as HtmlInCanvasElement | null)
  }, [])

  const sizeStyle =
    width !== undefined && height !== undefined
      ? { width: `${width}px`, height: `${height}px` }
      : { width: '100%', height: '100%' }
  const combinedStyle: CSSProperties = {
    display: 'block',
    ...(processedMask && { mask: processedMask }),
    pointerEvents: 'none',
    ...sizeStyle,
    ...style,
  }
  return error !== null ? (
    <WebGLShaderFallback shader={shader} className={className} style={combinedStyle} />
  ) : (
    <canvas
      className={className}
      style={combinedStyle}
      ref={canvasRef}
    />
  )
}
