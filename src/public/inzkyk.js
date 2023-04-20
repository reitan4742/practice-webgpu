"use strict";

const BUFFER_SIZE = 1000;

const shader = `
@group(0) @binding(1)
var<storage, read_write> output: array<f32>;

@compute @workgroup_size(64)
fn main(

  @builtin(global_invocation_id)
  global_id : vec3<u32>,

  @builtin(local_invocation_id)
  local_id : vec3<u32>,

) {
  output[global_id.x] = f32(global_id.x) * 1000. + f32(local_id.x);
}
`;

async function init() {
    if(!navigator.gpu) { // 物理的なGPUのオブジェクト
        throw Error("WebGPU not supported");
    }

    const adapter = await navigator.gpu.requestAdapter(); // アダプターのオブジェクト
    if (!adapter) {
        throw Error("Couldn\'t request WebGPU adapter");
    }

    const device = await adapter.requestDevice(); // 論理デバイスのオブジェクト
    if (!device) {
        throw Error("Couldn\'t request WebGPU logical device");
    }

    const module = device.createShaderModule({
        code: shader, // GPU上で実行されるプログラムであるシェーダ(WGSL)をモジュールにする
    });

    const output = device.createBuffer({ // GPU計算結果の書き込みを行うバッファの宣言
        size: BUFFER_SIZE,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC
    });

    const stagingBuffer = device.createBuffer({ // CPU側から読み取り可能なバッファの宣言
        size: BUFFER_SIZE,
        usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    const bindGroupLayout = device.createBindGroupLayout({ // bindgroup(GPUの要素)の型、用途、使い方の定義
        entries: [{
            binding: 1, // WGSLでの宣言との紐づけ
            visibility: GPUShaderStage.COMPUTE,
            buffer: {
                type: "storage",
            },
        }],
    });

    const bindGroup = device.createBindGroup({ // bindgroup(GPUの要素)の宣言
        layout: bindGroupLayout, // Layoutとの紐づけ
        entries: [{
            binding: 1, // WGSLでの宣言との紐づけ
            resource: {
                buffer: output, // 出力用のバッファを紐づけ
            },
        }],
    });

    const pipeline = device.createComputePipeline({ // パイプライン(一連の流れ)の宣言
        layout: device.createPipelineLayout({ // パイプラインのレイアウト宣言
            bindGroupLayouts: [bindGroupLayout],
        }),
        compute: {
            module, // module(WGSL)との紐づけ
            entryPoint: "main", // エントリーポイント(WGSL内の関数名)を紐づけ
        },
    });

    const commandEncoder = device.createCommandEncoder(); // GPUへのコマンドのエンコーダの宣言
    const passEncoder = commandEncoder.beginComputePass(); // 計算パスのエンコード開始
    passEncoder.setPipeline(pipeline); // パイプラインの設定
    passEncoder.setBindGroup(0, bindGroup); // 計算コマンドに使用するbindgroup(GPU要素)の設定
    passEncoder.dispatchWorkgroups(Math.ceil(BUFFER_SIZE / 64)); // workgroupの個数
    passEncoder.end(); // 計算パスのエンコードの終了
    commandEncoder.copyBufferToBuffer( // BufferからBufferへのコピーを行う
        output,
        0, // Source offset
        stagingBuffer,
        0, // Destination offset
        BUFFER_SIZE
    );
    const commands = commandEncoder.finish(); // コマンドのエンコードの終了
    device.queue.submit([commands]); // コマンドバッファをキューに入れる

    await stagingBuffer.mapAsync( // バッファをマップをする要求を送る
        GPUMapMode.READ,
        0, // Offset
        BUFFER_SIZE // Length
    );
    const copyArrayBuffer = stagingBuffer.getMappedRange(0, BUFFER_SIZE); // マップされたバッファをArrayBufferとする
    const data = copyArrayBuffer.slice(); // アンマップされると消えるのでjs側にコピーを用意
    stagingBuffer.unmap(); // アンマップする
    console.log(new Float32Array(data)); // 出力
}

init();