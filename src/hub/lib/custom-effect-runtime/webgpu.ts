import { useEffect, useState } from 'react'

// Module-level singleton. Acquiring a GPUDevice is expensive and a single device can
// back every ShaderEffect on the page, so we acquire it once and hand the same promise
// to all callers rather than one device per component.
let devicePromise: Promise<GPUDevice> | null = null

export function isDesktopWebGPUSupported(): boolean {
  try {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      return false
    }
    if (!navigator.gpu) {
      return false
    }
    if (typeof GPUTextureUsage === 'undefined' || typeof GPUBufferUsage === 'undefined') {
      return false
    }
    const ua = navigator.userAgent || ''
    // Mobile browsers (iOS WebKit, Android) and Safari have partial WebGPU implementations;
    // use the universal WebGL shader path synchronously on those platforms.
    if (/iPhone|iPad|iPod|Android|Mobile/i.test(ua)) {
      return false
    }
    if (/Safari/i.test(ua) && !/Chrome|Chromium|Edg/i.test(ua)) {
      return false
    }
    // Also detect iPadOS desktop-class UA (Macintosh with touch points)
    if (/Macintosh/i.test(ua) && navigator.maxTouchPoints && navigator.maxTouchPoints > 1) {
      return false
    }
    return true
  } catch {
    return false
  }
}

// Requests the adapter and device on first call and caches the promise. On failure the
// cache is cleared so a later mount can retry.
function acquireDevice(): Promise<GPUDevice> {
  if (!devicePromise) {
    devicePromise = (async () => {
      if (!isDesktopWebGPUSupported() || !navigator.gpu) {
        throw new Error('WebGPU unsupported on this platform.')
      }
      const adapter = await navigator.gpu.requestAdapter()
      if (!adapter) {
        throw new Error('Failed to get WebGPU adapter.')
      }
      return adapter.requestDevice()
    })()
    devicePromise.catch(() => {
      devicePromise = null
    })
  }
  return devicePromise
}

/**
 * Shares one WebGPU device across every ShaderEffect. The device is initialized once and
 * never destroyed for the page lifetime, so multiple effects can render against it.
 * Returns the device once ready (null until then) and any acquisition error.
 */
export function useWebGPUDevice(): { device: GPUDevice | null; error: Error | null } {
  const [device, setDevice] = useState<GPUDevice | null>(null)
  const [error, setError] = useState<Error | null>(() =>
    isDesktopWebGPUSupported() ? null : new Error('Using WebGL shader fallback'),
  )

  useEffect(() => {
    if (!isDesktopWebGPUSupported()) {
      return
    }
    let cancelled = false
    void acquireDevice().then(
      (acquired) => {
        if (!cancelled) {
          setDevice(acquired)
        }
      },
      (e) => {
        if (!cancelled) {
          console.warn('Failed to acquire WebGPU device', e)
          setError(e instanceof Error ? e : new Error(String(e)))
        }
      },
    )
    return () => {
      cancelled = true
    }
  }, [])

  return { device, error }
}
