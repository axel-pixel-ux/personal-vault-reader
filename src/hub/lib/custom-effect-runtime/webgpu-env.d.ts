// Ambient WebGPU type definitions for environments where @webgpu/types is not globally loaded.
type GPUTextureFormat = 'rgba8unorm' | 'bgra8unorm' | string

interface GPUDevice {
  readonly queue: GPUQueue
  readonly limits: {
    readonly maxTextureDimension2D: number
  }
  createTexture(descriptor: {
    label?: string
    size: [number, number, number]
    format: GPUTextureFormat
    usage: number
  }): GPUTexture
  createShaderModule(descriptor: { code: string }): unknown
  createBuffer(descriptor: {
    size: number
    usage: number
    mappedAtCreation?: boolean
  }): GPUBuffer
  createRenderPipeline(descriptor: unknown): GPURenderPipeline
  createBindGroup(descriptor: unknown): unknown
  createCommandEncoder(): GPUCommandEncoder
}

interface GPUBuffer {
  getMappedRange(): ArrayBuffer
  unmap(): void
  destroy(): void
}

interface GPURenderPipeline {
  getBindGroupLayout(index: number): unknown
}

interface GPUCommandEncoder {
  beginRenderPass(descriptor: unknown): {
    setPipeline(pipeline: unknown): void
    setBindGroup(index: number, bindGroup: unknown): void
    setVertexBuffer(slot: number, buffer: unknown): void
    draw(vertexCount: number): void
    end(): void
  }
  finish(): unknown
}

interface GPUQueue {
  writeBuffer(buffer: GPUBuffer, bufferOffset: number, data: BufferSource): void
  submit(commandBuffers: unknown[]): void
}

interface GPUTexture {
  readonly width: number
  readonly height: number
  createView(): unknown
  destroy(): void
}

interface GPUCanvasContext {
  configure(configuration: {
    device: GPUDevice
    format: GPUTextureFormat
    alphaMode?: 'opaque' | 'premultiplied'
  }): void
  getCurrentTexture(): GPUTexture
}

declare const GPUTextureUsage: {
  readonly COPY_SRC: number
  readonly COPY_DST: number
  readonly TEXTURE_BINDING: number
  readonly STORAGE_BINDING: number
  readonly RENDER_ATTACHMENT: number
}

declare const GPUBufferUsage: {
  readonly MAP_READ: number
  readonly MAP_WRITE: number
  readonly COPY_SRC: number
  readonly COPY_DST: number
  readonly INDEX: number
  readonly VERTEX: number
  readonly UNIFORM: number
  readonly STORAGE: number
  readonly INDIRECT: number
  readonly QUERY_RESOLVE: number
}

interface Navigator {
  readonly gpu?: {
    requestAdapter(): Promise<{
      requestDevice(): Promise<GPUDevice>
    } | null>
  }
}
