"use strict";

const rand = (min, max) => {
    if (min === undefined) {
        min = 0;
        max = 1;
    } else if (max === undefined) {
        max = min;
        min = 0;
    }
    return min + Math.random() * (max - min);
};
  
function createCircleVertices({
    radius = 1,
    numSubdivisions = 24,
    innerRadius = 0,
    startAngle = 0,
    endAngle = Math.PI * 2,
} = {}) {
    // 2 triangles per subdivision, 3 verts per tri, 5 values (xyrgb) each.
    const numVertices = numSubdivisions * 3 * 2;
    const positionData = new Float32Array(numVertices * 2);
    const colorData = new Float32Array(numVertices * 3);
   
    let posOffset = 0;
    let colorOffset = 0;
    const addVertex = (x, y, r, g, b) => {
        positionData[posOffset++] = x;
        positionData[posOffset++] = y;
        colorData[colorOffset++] = r;
        colorData[colorOffset++] = g;
        colorData[colorOffset++] = b;
    };


    const innerColor = [1, 1, 1];
    const outerColor = [0.1, 0.1, 0.1];
   
    // 2 vertices per subdivision
    //
    // 0--1 4
    // | / /|
    // |/ / |
    // 2 3--5
    for (let i = 0; i < numSubdivisions; ++i) {
        const angle1 = startAngle + (i + 0) * (endAngle - startAngle) / numSubdivisions;
        const angle2 = startAngle + (i + 1) * (endAngle - startAngle) / numSubdivisions;
   
        const c1 = Math.cos(angle1);
        const s1 = Math.sin(angle1);
        const c2 = Math.cos(angle2);
        const s2 = Math.sin(angle2);
   
        // first triangle
        addVertex(c1 * radius, s1 * radius, ...outerColor);
        addVertex(c2 * radius, s2 * radius, ...outerColor);
        addVertex(c1 * innerRadius, s1 * innerRadius, ...innerColor);
        addVertex(c1 * innerRadius, s1 * innerRadius, ...innerColor);
        addVertex(c2 * radius, s2 * radius, ...outerColor);
        addVertex(c2 * innerRadius, s2 * innerRadius, ...innerColor);
    }
   
    return {
        positionData,
        colorData,
        numVertices,
    };
}
  
async function main() {
    const adapter = await navigator.gpu?.requestAdapter();
    const device = await adapter?.requestDevice();
    if (!device) {
        fail("need a browser that supports WebGPU");
        return;
    }
  
    // Get a WebGPU context from the canvas and configure it
    const canvas = document.querySelector("canvas");
    const context = canvas.getContext("webgpu");
    const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
        device,
        format: presentationFormat,
    });
  
    const module = device.createShaderModule({
        code: `
        struct OurStruct {
          color: vec4f,
          offset: vec2f,
        };
  
        struct OtherStruct {
          scale: vec2f,
        };
  
        struct Vertex {
          @location(0) position: vec2f,
          @location(1) color: vec3f,
        };
  
        struct VSOutput {
          @builtin(position) position: vec4f,
          @location(0) color: vec4f,
        };
  
        @group(0) @binding(0) var<storage, read> ourStructs: array<OurStruct>;
        @group(0) @binding(1) var<storage, read> otherStructs: array<OtherStruct>;
  
        @vertex fn vs(
          @location(0) position: vec2f,
          @location(1) color: vec3f,
          @builtin(instance_index) instanceIndex: u32
        ) -> VSOutput {
          let otherStruct = otherStructs[instanceIndex];
          let ourStruct = ourStructs[instanceIndex];
  
          var vsOut: VSOutput;
          vsOut.position = vec4f(
            position * otherStruct.scale + ourStruct.offset, 0.0, 1.0
          );
          vsOut.color = ourStruct.color * vec4f(color, 1);
          return vsOut;
        }

        @fragment fn fs(vsOut: VSOutput) -> @location(0) vec4f {
          return vsOut.color;
        }
      `,
    });
  
    const pipeline = device.createRenderPipeline({
        label: "fake simple lighting",
        layout: "auto",
        vertex: {
            module,
            entryPoint: "vs",
            buffers: [
                {
                    arrayStride: 2 * 4, // 2 floats, 4 bytes each
                    attributes: [
                        {shaderLocation: 0, offset: 0, format: "float32x2"}, // position
                    ],
                },
                {
                    arrayStride: 3 * 4,
                    attributes: [
                        {shaderLocation: 1, offset: 0, format: "float32x3"},
                    ],
                },
            ],
        },
        fragment: {
            module,
            entryPoint: "fs",
            targets: [{ format: presentationFormat }],
        },
    });
  
    const kNumObjects = 100;
    const objectInfos = [];
  
    // create 2 storage buffers
    const staticUnitSize =
      4 * 4 + // color is 4 32bit floats (4bytes each)
      2 * 4 + // offset is 2 32bit floats (4bytes each)
      2 * 4;  // padding
    const changingUnitSize =
      2 * 4;  // scale is 2 32bit floats (4bytes each)
    const staticStorageBufferSize = staticUnitSize * kNumObjects;
    const changingStorageBufferSize = changingUnitSize * kNumObjects;
  
    const staticStorageBuffer = device.createBuffer({
        label: "static storage for objects",
        size: staticStorageBufferSize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
  
    const changingStorageBuffer = device.createBuffer({
        label: "changing storage for objects",
        size: changingStorageBufferSize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
  
    // offsets to the various uniform values in float32 indices
    const kColorOffset = 0;
    const kOffsetOffset = 4;
  
    const kScaleOffset = 0;
  
    {
        const staticStorageValues = new Float32Array(staticStorageBufferSize / 4);
        for (let i = 0; i < kNumObjects; ++i) {
            const staticOffset = i * (staticUnitSize / 4);
  
            // These are only set once so set them now
            staticStorageValues.set([rand(), rand(), rand(), 1], staticOffset + kColorOffset);        // set the color
            staticStorageValues.set([rand(-0.9, 0.9), rand(-0.9, 0.9)], staticOffset + kOffsetOffset);      // set the offset
  
            objectInfos.push({
                scale: rand(0.2, 0.5),
            });
        }
        device.queue.writeBuffer(staticStorageBuffer, 0, staticStorageValues);
    }
  
    // a typed array we can use to update the changingStorageBuffer
    const storageValues = new Float32Array(changingStorageBufferSize / 4);
  
    const { positionData, colorData, numVertices } = createCircleVertices({
        radius: 0.5,
        innerRadius: 0.25,
    });

    const positionBuffer = device.createBuffer({
        label: "position buffer",
        size: positionData.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(positionBuffer, 0, positionData);

    const colorBuffer = device.createBuffer({
        label: "color buffer",
        size: colorData.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(colorBuffer, 0, colorData);
  
    const bindGroup = device.createBindGroup({
        label: "bind group for objects",
        layout: pipeline.getBindGroupLayout(0),
        entries: [
            { binding: 0, resource: { buffer: staticStorageBuffer }},
            { binding: 1, resource: { buffer: changingStorageBuffer }},
        ],
    });
  
    const renderPassDescriptor = {
        label: "our basic canvas renderPass",
        colorAttachments: [
            {
                // view: <- to be filled out when we render
                clearValue: [0.3, 0.3, 0.3, 1],
                loadOp: "clear",
                storeOp: "store",
            },
        ],
    };
  
    function render() {
        // Get the current texture from the canvas context and
        // set it as the texture to render to.
        renderPassDescriptor.colorAttachments[0].view =
          context.getCurrentTexture().createView();
  
        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass(renderPassDescriptor);
        pass.setPipeline(pipeline);
        pass.setVertexBuffer(0, positionBuffer);
        pass.setVertexBuffer(1, colorBuffer);
  
        // Set the uniform values in our JavaScript side Float32Array
        const aspect = canvas.width / canvas.height;
  
        // set the scales for each object
        objectInfos.forEach(({scale}, ndx) => {
            const offset = ndx * (changingUnitSize / 4);
            storageValues.set([scale / aspect, scale], offset + kScaleOffset); // set the scale
        });
        // upload all scales at once
        device.queue.writeBuffer(changingStorageBuffer, 0, storageValues);
  
        pass.setBindGroup(0, bindGroup);
        pass.draw(numVertices, kNumObjects);
  
        pass.end();
  
        const commandBuffer = encoder.finish();
        device.queue.submit([commandBuffer]);
    }
  
    const observer = new ResizeObserver(entries => {
        for (const entry of entries) {
            const canvas = entry.target;
            const width = entry.contentBoxSize[0].inlineSize;
            const height = entry.contentBoxSize[0].blockSize;
            canvas.width = Math.min(width, device.limits.maxTextureDimension2D);
            canvas.height = Math.min(height, device.limits.maxTextureDimension2D);
            // re-render
            render();
        }
    });
    observer.observe(canvas);
}
  
main();