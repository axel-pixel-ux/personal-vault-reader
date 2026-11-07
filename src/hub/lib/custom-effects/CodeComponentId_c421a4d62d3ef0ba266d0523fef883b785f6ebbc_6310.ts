// lib/custom-effects/CodeComponentId_c421a4d62d3ef0ba266d0523fef883b785f6ebbc_6310.ts
// @ts-nocheck

// Property metadata is only used in Figma Design, so this is a no-op.
function defineProperties(
  _component: unknown,
  _properties: unknown,
): void {}

export default function Effect() { }
export function setup(device, frame) {
    var wgsl = `
diagnostic(off,derivative_uniformity);
struct Uniforms {
  frameData: vec4f,
  inputDimsData: vec4f,
  color1: vec4f,
  color2: vec4f,
  color3: vec4f,
  color4: vec4f,
  seed: vec4f,
  speed: vec4f,
  featureScale: vec4f,
  amplitude: vec4f,
  frequency: vec4f,
  definition: vec4f,
  bands: vec4f,
  grain: vec4f,
  exposure: vec4f,
  contrastAmt: vec4f,
  saturation: vec4f,
};
@group(0) @binding(0) var<uniform> u: Uniforms;

struct VsIn {
  @location(0) pos: vec2f,
  @location(1) uv: vec2f,
};
struct VsOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

fn srgbToLinear(c: f32) -> f32 {

  if (c <= 0.04045) { return c / 12.92; }

  return pow((c + 0.055) / 1.055, 2.4);

}

fn linearToSrgb(c: f32) -> f32 {

  if (c <= 0.0031308) { return c * 12.92; }

  return 1.055 * pow(c, 1.0 / 2.4) - 0.055;

}

fn srgb3ToLinear(c: vec3f) -> vec3f {

  return vec3f(srgbToLinear(c.x), srgbToLinear(c.y), srgbToLinear(c.z));

}

fn linear3ToSrgb(c: vec3f) -> vec3f {

  return vec3f(linearToSrgb(c.x), linearToSrgb(c.y), linearToSrgb(c.z));

}

fn linearToOklab(c: vec3f) -> vec3f {

  let l = 0.4122214708 * c.x + 0.5363325363 * c.y + 0.0514459929 * c.z;

  let m = 0.2119034982 * c.x + 0.6806995451 * c.y + 0.1073969566 * c.z;

  let s = 0.0883024619 * c.x + 0.2817188376 * c.y + 0.6299787005 * c.z;

  let l_ = pow(max(l, 0.0), 1.0 / 3.0);

  let m_ = pow(max(m, 0.0), 1.0 / 3.0);

  let s_ = pow(max(s, 0.0), 1.0 / 3.0);

  return vec3f(

    0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,

    1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,

    0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_

  );

}

fn oklabToLinear(c: vec3f) -> vec3f {

  let l_ = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;

  let m_ = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;

  let s_ = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;

  let l = l_ * l_ * l_;

  let m = m_ * m_ * m_;

  let s = s_ * s_ * s_;

  return vec3f(

    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,

    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,

    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s

  );

}

fn oklabToLch(lab: vec3f) -> vec3f {

  let C = sqrt(lab.y * lab.y + lab.z * lab.z);

  let h = atan2(lab.z, lab.y);

  return vec3f(lab.x, C, h);

}

fn lchToOklab(lch: vec3f) -> vec3f {

  return vec3f(lch.x, lch.y * cos(lch.z), lch.y * sin(lch.z));

}

fn mixOklch(a: vec3f, b: vec3f, t: f32) -> vec3f {

  let labA = linearToOklab(a);

  let labB = linearToOklab(b);

  let lchA = oklabToLch(labA);

  let lchB = oklabToLch(labB);

  let L = mix(lchA.x, lchB.x, t);

  let C = mix(lchA.y, lchB.y, t);

  var dh = lchB.z - lchA.z;

  if (dh > 3.14159265) { dh = dh - 6.28318530; }

  if (dh < -3.14159265) { dh = dh + 6.28318530; }

  let h = lchA.z + dh * t;

  return oklabToLinear(lchToOklab(vec3f(L, C, h)));

}

@vertex fn vs_main(in: VsIn) -> VsOut {
  var out: VsOut;
  out.position = vec4f(in.pos, 0.0, 1.0);
  out.uv = in.uv;
  return out;
}

@fragment fn fs_main(@location(0) outputUv_in: vec2f) -> @location(0) vec4f {
  let time = u.frameData.x;
  let outputUv = outputUv_in;
  let dims = max(u.frameData.yz, vec2f(1.0));
  let inputDims = max(u.inputDimsData.xy, vec2f(1.0));
  let inputTexel = vec2f(1.0) / inputDims;
  let uv = outputUv;
  let texel = inputTexel;
  let aspect = inputDims.x / max(inputDims.y, 1.0);
  let color1 = u.color1;
  let color2 = u.color2;
  let color3 = u.color3;
  let color4 = u.color4;
  let seed = u.seed.x;
  let speed = u.speed.x;
  let featureScale = u.featureScale.x;
  let amplitude = u.amplitude.x;
  let frequency = u.frequency.x;
  let definition = u.definition.x;
  let bands = u.bands.x;
  let grain = u.grain.x;
  let exposure = u.exposure.x;
  let contrastAmt = u.contrastAmt.x;
  let saturation = u.saturation.x;
  let T = time * 0.001 * 0.3 * speed;

  let p0 = vec2f((uv.x * 2.0 - 1.0) * aspect, -(uv.y * 2.0 - 1.0));

  let ang = seed * 2.3999632;
  let ca = cos(ang);
  let sa = sin(ang);
  let p = vec2f(ca * p0.x + sa * p0.y, -sa * p0.x + ca * p0.y) * featureScale;

  let so  = vec3f(0.185610, 0.435062, 0.842443);
  let so2 = vec3f(0.640671, 0.186654, 0.946699);
  var q = p;
  var a_acc = 0.883862;
  var d_acc = -1.968811;

  let maxIter = i32(definition);
  for (var j = 2; j < 13; j = j + 1) {
    if (j >= maxIter) { break; }
    let fj = f32(j);
    q = q + amplitude * sin(q.yx * frequency * fj + T + vec2f(a_acc, d_acc) + so.xy * fj) / fj;
    a_acc = a_acc + cos(fj + d_acc * 1.2 + q.x * 2.0 - T + so2.z);
    d_acc = d_acc + sin(fj * q.y + a_acc + so.z + T + so2.y);
  }

  let L = length(q.yx + vec2f(a_acc, d_acc) * 0.2) * bands + so.x;
  let s1 = 0.5 + 0.5 * sin(L + 1.0);
  let s2 = 0.5 + 0.5 * sin(L + 4.0);
  let s3 = 0.5 + 0.5 * sin(L + 9.0);
  var val = (s1 * 0.5 + s2 + s3 * 0.5) * 0.5;
  val = clamp((val - 0.3) / 0.4, 0.0, 1.0);

  let pix = floor(uv * dims);
  let ign = fract(52.9829189 * fract(dot(pix, vec2f(0.06711056, 0.00583715))));
  val = clamp(val + (ign - 0.5) * grain, 0.0, 1.0);

  let lin1 = srgb3ToLinear(color1.rgb);
  let lin2 = srgb3ToLinear(color2.rgb);
  let lin3 = srgb3ToLinear(color3.rgb);
  let lin4 = srgb3ToLinear(color4.rgb);
  var col: vec3f;
  if (val < 0.333333) {
    col = mixOklch(lin1, lin2, val * 3.0);
  } else if (val < 0.666667) {
    col = mixOklch(lin2, lin3, (val - 0.333333) * 3.0);
  } else {
    col = mixOklch(lin3, lin4, (val - 0.666667) * 3.0);
  }

  col = col * exposure;
  var lab = linearToOklab(col);
  lab = vec3f(clamp((lab.x - 0.5) * contrastAmt + 0.5, 0.0, 1.0), lab.y * saturation, lab.z * saturation);
  col = oklabToLinear(lab);

  let mx = max(col.x, max(col.y, col.z));
  let mn = min(col.x, min(col.y, col.z));
  if (mn < 0.0 || mx > 1.0) {
    let g = linearToOklab(max(col, vec3f(0.0)));
    let gl = clamp(g.x, 0.0, 1.0);
    var gc = length(g.yz);
    let gh = atan2(g.z, g.y);
    let maxC = 0.4 * (1.0 - pow(abs(2.0 * gl - 1.0), 2.0));
    let knee = maxC * 0.7;
    if (gc > knee) { gc = knee + (maxC - knee) * tanh((gc - knee) / (maxC - knee + 0.001)); }
    col = clamp(oklabToLinear(vec3f(gl, gc * cos(gh), gc * sin(gh))), vec3f(0.0), vec3f(1.0));
  }
  col = linear3ToSrgb(clamp(col, vec3f(0.0), vec3f(1.0)));
  return vec4f(col, 1.0);
}
`;
    frame.state.module = device.createShaderModule({ code: wgsl });
    frame.state.pipeline = null;
    frame.state.pipelineFormat = null;
    frame.state.quad = device.createBuffer({
        size: 6 * 4 * 4,
        usage: GPUBufferUsage.VERTEX,
        mappedAtCreation: true,
    });
    new Float32Array(frame.state.quad.getMappedRange()).set([
        -1, -1, 0, 1,
        1, -1, 1, 1,
        -1, 1, 0, 0,
        -1, 1, 0, 0,
        1, -1, 1, 1,
        1, 1, 1, 0,
    ]);
    frame.state.quad.unmap();
    frame.state.uniformBuf = device.createBuffer({
        size: 272,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
}
export function render(device, frame) {
    var params = frame.params || {};
    function finiteNumber(value, fallback) {
        var num = Number(value);
        return Number.isFinite(num) ? num : fallback;
    }
    function numberParam(name, fallback) {
        return finiteNumber(params[name], fallback);
    }
    function colorParam(name, fallback) {
        var value = params[name] || {};
        return [
            finiteNumber(value.r, fallback[0]),
            finiteNumber(value.g, fallback[1]),
            finiteNumber(value.b, fallback[2]),
            finiteNumber(value.a, fallback[3]),
        ];
    }
    var output = frame.output || {};
    var width = Math.max(1, finiteNumber(output.width, 1));
    var height = Math.max(1, finiteNumber(output.height, 1));
    var time = finiteNumber(frame.time, 0);
    var inputWidth = width;
    var inputHeight = height;
    device.queue.writeBuffer(frame.state.uniformBuf, 0, new Float32Array([
        time, width, height, 0,
        inputWidth, inputHeight, 0, 0,
        ...colorParam("color1", [0.12549019607843137, 0.12549019607843137, 0.12549019607843137, 1]),
        ...colorParam("color2", [0.8705882352941177, 0.8705882352941177, 0.8705882352941177, 1]),
        ...colorParam("color3", [0.39215686274509803, 0.39215686274509803, 0.39215686274509803, 1]),
        ...colorParam("color4", [0.807843137254902, 0.807843137254902, 0.807843137254902, 1]),
        numberParam("seed", 348), 0, 0, 0,
        numberParam("speed", 1.6), 0, 0, 0,
        numberParam("featureScale", 0.53), 0, 0, 0,
        numberParam("amplitude", 0), 0, 0, 0,
        numberParam("frequency", 0.92), 0, 0, 0,
        numberParam("definition", 6), 0, 0, 0,
        numberParam("bands", 1.7), 0, 0, 0,
        numberParam("grain", 0.04), 0, 0, 0,
        numberParam("exposure", 1), 0, 0, 0,
        numberParam("contrastAmt", 1.2), 0, 0, 0,
        numberParam("saturation", 1), 0, 0, 0,
    ]));
    var outputFormat = frame.output.format;
    if (frame.state.pipeline == null || frame.state.pipelineFormat !== outputFormat) {
        frame.state.pipeline = device.createRenderPipeline({
            layout: 'auto',
            vertex: {
                module: frame.state.module,
                entryPoint: 'vs_main',
                buffers: [{
                        arrayStride: 16,
                        attributes: [
                            { shaderLocation: 0, format: 'float32x2', offset: 0 },
                            { shaderLocation: 1, format: 'float32x2', offset: 8 },
                        ],
                    }],
            },
            fragment: {
                module: frame.state.module,
                entryPoint: 'fs_main',
                targets: [{ format: outputFormat }],
            },
            primitive: { topology: 'triangle-list' },
        });
        frame.state.pipelineFormat = outputFormat;
    }
    var bindGroup = device.createBindGroup({
        layout: frame.state.pipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: frame.state.uniformBuf } },
        ],
    });
    var encoder = device.createCommandEncoder();
    var pass = encoder.beginRenderPass({
        colorAttachments: [{
                view: frame.output.createView(),
                loadOp: 'clear',
                clearValue: { r: 0, g: 0, b: 0, a: 0 },
                storeOp: 'store',
            }],
    });
    pass.setPipeline(frame.state.pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.setVertexBuffer(0, frame.state.quad);
    pass.draw(6);
    pass.end();
    device.queue.submit([encoder.finish()]);
}
defineProperties(Effect, {
    "color1": {
        type: "color",
        label: "Color 1",
        defaultValue: { "r": 0.12549019607843137, "g": 0.12549019607843137, "b": 0.12549019607843137, "a": 1 },
    },
    "color2": {
        type: "color",
        label: "Color 2",
        defaultValue: { "r": 0.8705882352941177, "g": 0.8705882352941177, "g2": 0.8705882352941177, "b": 0.8705882352941177, "a": 1 },
    },
    "color3": {
        type: "color",
        label: "Color 3",
        defaultValue: { "r": 0.39215686274509803, "g": 0.39215686274509803, "b": 0.39215686274509803, "a": 1 },
    },
    "color4": {
        type: "color",
        label: "Color 4",
        defaultValue: { "r": 0.807843137254902, "g": 0.807843137254902, "b": 0.807843137254902, "a": 1 },
    },
    "seed": {
        type: "number",
        label: "Seed",
        defaultValue: 348,
        control: "slider",
        min: 0,
        max: 1000,
        step: 1,
    },
    "speed": {
        type: "number",
        label: "Speed",
        defaultValue: 1.6,
        control: "slider",
        min: 0,
        max: 2,
        step: 0.01,
    },
    "featureScale": {
        type: "number",
        label: "Feature Scale",
        defaultValue: 0.53,
        control: "slider",
        min: 0.1,
        max: 2,
        step: 0.01,
    },
    "amplitude": {
        type: "number",
        label: "Amplitude",
        defaultValue: 0,
        control: "slider",
        min: 0,
        max: 1,
        step: 0.01,
    },
    "frequency": {
        type: "number",
        label: "Frequency",
        defaultValue: 0.92,
        control: "slider",
        min: 0.1,
        max: 2,
        step: 0.01,
    },
    "definition": {
        type: "number",
        label: "Definition",
        defaultValue: 6,
        control: "slider",
        min: 3,
        max: 10,
        step: 1,
    },
    "bands": {
        type: "number",
        label: "Bands",
        defaultValue: 1.7,
        control: "slider",
        min: 0.1,
        max: 5,
        step: 0.1,
    },
    "grain": {
        type: "number",
        label: "Grain",
        defaultValue: 0.04,
        control: "slider",
        min: 0,
        max: 0.2,
        step: 0.01,
    },
    "exposure": {
        type: "number",
        label: "Exposure",
        defaultValue: 1,
        control: "slider",
        min: 0.5,
        max: 3,
        step: 0.01,
    },
    "contrastAmt": {
        type: "number",
        label: "Contrast",
        defaultValue: 1.2,
        control: "slider",
        min: 0.5,
        max: 3,
        step: 0.01,
    },
    "saturation": {
        type: "number",
        label: "Saturation",
        defaultValue: 1,
        control: "slider",
        min: 0,
        max: 3,
        step: 0.01,
    },
});

export const manifest = {
  "version": 2,
  "name": "Liquid Metal",
  "isAnimated": true,
  "usesMouse": false
}
