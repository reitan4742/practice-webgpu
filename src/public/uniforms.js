"use strict";

async function main() {
    if (!navigator.gpu) {
        throw Error("WebGPU not supported");
    }
    const adapter = await navigator.gpu.requestAdapter();
    const device = await adapter.requestDevice();

    const canvas = document.querySelector("canvas");
    const context = canvas.getContext("webgpu");
    const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
    device: device,
    format: presentationFormat,
    });

    const module = device.createShaderModule({
        code: `
          struct OurStruct {
            color: vec4f,
            scale: vec2f,
            offset: vec2f,
          };
    
          @group(0) @binding(0) var<uniform> ourStruct: OurStruct;
    
          @vertex fn vs(
            @builtin(vertex_index) vertexIndex : u32
          ) -> @builtin(position) vec4f {
            var pos = array<vec2f, 3>(
              vec2f( 0.0,  0.5),  // top center
              vec2f(-0.5, -0.5),  // bottom left
              vec2f( 0.5, -0.5)   // bottom right
            );
    
            return vec4f(
              pos[vertexIndex] * ourStruct.scale + ourStruct.offset, 0.0, 1.0);
          }
    
          @fragment fn fs() -> @location(0) vec4f {
            return ourStruct.color;
          }
        `,
      });

      const pipeline = device.createRenderPipeline({
        layout: "auto",
        vertex: {
            module: module,
            entryPoint: "vs",
        },
        fragment: {
            module: module,
            entryPoint: "fs",
            targets: [{ format: presentationFormat }],
        },
      });

      const uniformBufferSize = 
      4 * 4 + // color
      2 * 4 + // scale
      2 * 4; // ofset
      const uniformBuffer = device.createBuffer({
        size: uniformBufferSize,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });

      const uniformValues = new Float32Array(uniformBufferSize / 4);

      const kColorOffset = 0;
      const kScaleOffset = 4;
      const kOffsetOffset = 6;

      uniformValues.set([0, 1, 0, 1], kColorOffset);
      uniformValues.set([-0.5, -0.25], kOffsetOffset);

    //   shaderにバッファのことを伝えるためにバインドグループを作る
      const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: uniformBuffer }},
        ],
      });

      const renderPassDescriptor = {
        label: "our basisc canvas renderPass",
        colorAttachments: [
          {
            clearValue: [0.3, 0.3, 0.3, 1],
            loadOp: "clear",
            storeOp: "store",
          },
        ],
      };

      function render() {
        const aspect = canvas.width / canvas.height;
        uniformValues.set([0.5 / aspect, 0.5], kScaleOffset);
        // copy the values from js to gpu
        device.queue.writeBuffer(uniformBuffer, 0, uniformValues);

        renderPassDescriptor.colorAttachments[0].view = context.getCurrentTexture().createView();
        const encoder = device.createCommandEncoder({ label: "our encoder" });
        const pass = encoder.beginRenderPass(renderPassDescriptor);
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.draw(3);
        pass.end();

        const commandBuffer = encoder.finish();
        device.queue.submit([commandBuffer]);
      }
      render();
}

main();