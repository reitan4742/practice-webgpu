"use strict";

const BUFFER_SIZE = 1000;

const shader = `
@compute @workgroup_size(64)
fn main() {

}
`;

async function init() {
    if(!navigator.gpu) {
        throw Error("WebGPU not supported");
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
        throw Error("Couldn\'t request WebGPU adapter");
    }

    const device = await adapter.requestDevice();
    if (!device) {
        throw Error("Couldn\'t request WebGPU logical device");
    }

    const module = device.createShaderModule({
        code: shader,
    });

    const output = device.createBuffer({
        size: BUFFER_SIZE,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });

    const stagingBuffer = device.createBuffer({
        size: BUFFER_SIZE,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    const bindGroupLayout = device.createBindGroupLayout({
        entries: [{
            binding: 1,
            visibility: GPUShaderStage.COMPUTE,
            buffer: {
                type: "storage",
            },
        }],
    });

    const bindGroup = device.createBindGroup({
        layout: bindGroupLayout,
        entries: [{
            binding: 1,
            resource: {
                buffer: output,
            },
        }],
    });

    const pipeline = device.createComputePipeline({
        layout: device.createPipelineLayout({
            bindGroupLayouts: [bindGroupLayout],
        }),
        compute: {
            module,
            entryPoint: "main",
        },
    });

    const commandEncoder = device.createCommandEncoder();
    const passEncoder = commandEncoder.beginComputePass();
    passEncoder.setPipeline(pipeline);
    passEncoder.setBindGroup(0,bindGroup);
    passEncoder.dispatchWorkgroups(Math.ceil(BUFFER_SIZE / 64));
    passEncoder.end();
    commandEncoder.copyBufferToBuffer(
        output,
        0, // Source offset
        stagingBuffer,
        0, // Destination offset
        BUFFER_SIZE,
    );
    const commands = commandEncoder.finish();
    device.queue.submit([commands]);

    await stagingBuffer.mapAsync(
        GPUMapMode.READ,
        0, // offset
        BUFFER_SIZE, // Length
    );
    const copyArrayBuffer = stagingBuffer.getMappedRange(0, BUFFER_SIZE);
    const data = copyArrayBuffer.slice();
    stagingBuffer.unmap();
    console.log(new Float32Array(data));
}

init();