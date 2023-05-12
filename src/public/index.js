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
    const numVertices = (numSubdivisions + 1) * 2;
    const vertexData = new Float32Array(numVertices * (2 + 3));
  
    let offset = 0;
    const addVertex = (x, y, r, g, b) => {
      vertexData[offset++] = x;
      vertexData[offset++] = y;
      vertexData[offset++] = r;
      vertexData[offset++] = g;
      vertexData[offset++] = b;
    };
  
    const innerColor = [1, 1, 1];
    const outerColor = [0.1, 0.1, 0.1];
  
    // 2 vertices per subdivision
    //
    // 0  2  4  6  8 ...
    //
    // 1  3  5  7  9 ...
    for (let i = 0; i <= numSubdivisions; ++i) {
      const angle = startAngle + (i + 0) * (endAngle - startAngle) / numSubdivisions;
  
      const c1 = Math.cos(angle);
      const s1 = Math.sin(angle);
  
      addVertex(c1 * radius, s1 * radius, ...outerColor);
      addVertex(c1 * innerRadius, s1 * innerRadius, ...innerColor);
    }
  
    const indexData = new Uint32Array(numSubdivisions * 6);
    let ndx = 0;
  
    // 0---2---4---...
    // | //| //|
    // |// |// |//
    // 1---3-- 5---...
    for (let i = 0; i < numSubdivisions; ++i) {
      const ndxOffset = i * 2;
  
      // first triangle
      indexData[ndx++] = ndxOffset;
      indexData[ndx++] = ndxOffset + 1;
      indexData[ndx++] = ndxOffset + 2;
  
      // second triangle
      indexData[ndx++] = ndxOffset + 2;
      indexData[ndx++] = ndxOffset + 1;
      indexData[ndx++] = ndxOffset + 3;
    }
  
    return {
      vertexData,
      indexData,
      numVertices: indexData.length,
    };
  }
  
  async function main() {
    const adapter = await navigator.gpu?.requestAdapter();
    const device = await adapter?.requestDevice();
    if (!device) {
      fail('need a browser that supports WebGPU');
      return;
    }
  
    // Get a WebGPU context from the canvas and configure it
    const canvas = document.querySelector('canvas');
    const context = canvas.getContext('webgpu');
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
          vert: Vertex,
          @builtin(instance_index) instanceIndex: u32
        ) -> VSOutput {
          let otherStruct = otherStructs[instanceIndex];
          let ourStruct = ourStructs[instanceIndex];
  
          var vsOut: VSOutput;
          vsOut.position = vec4f(
              vert.position * otherStruct.scale + ourStruct.offset, 0.0, 1.0);
          vsOut.color = ourStruct.color * vec4f(vert.color, 1);
          return vsOut;
        }
  
        @fragment fn fs(vsOut: VSOutput) -> @location(0) vec4f {
          return vsOut.color;
        }
      `,
    });
  
    const pipeline = device.createRenderPipeline({
      label: '2 attributes',
      layout: 'auto',
      vertex: {
        module,
        entryPoint: 'vs',
        buffers: [
          {
            arrayStride: (2 + 3) * 4, // (2 + 3) floats, 4 bytes each
            attributes: [
              {shaderLocation: 0, offset: 0, format: 'float32x2'},  // position
              {shaderLocation: 1, offset: 8, format: 'float32x3'},  // color
            ],
          },
        ],
      },
      fragment: {
        module,
        entryPoint: 'fs',
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
      label: 'static storage for objects',
      size: staticStorageBufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
  
    const changingStorageBuffer = device.createBuffer({
      label: 'changing storage for objects',
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
  
    const { vertexData, indexData, numVertices } = createCircleVertices({
      radius: 0.5,
      innerRadius: 0.25,
    });
    const vertexBuffer = device.createBuffer({
      label: 'vertex buffer vertices',
      size: vertexData.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(vertexBuffer, 0, vertexData);
    const indexBuffer = device.createBuffer({
      label: 'index buffer',
      size: indexData.byteLength,
      usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(indexBuffer, 0, indexData);
  
    const bindGroup = device.createBindGroup({
      label: 'bind group for objects',
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: staticStorageBuffer }},
        { binding: 1, resource: { buffer: changingStorageBuffer }},
      ],
    });
  
    const renderPassDescriptor = {
      label: 'our basic canvas renderPass',
      colorAttachments: [
        {
          // view: <- to be filled out when we render
          clearValue: [0.3, 0.3, 0.3, 1],
          loadOp: 'clear',
          storeOp: 'store',
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
      pass.setVertexBuffer(0, vertexBuffer);
      pass.setIndexBuffer(indexBuffer, 'uint32');
  
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
      pass.drawIndexed(numVertices, kNumObjects);
  
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
    