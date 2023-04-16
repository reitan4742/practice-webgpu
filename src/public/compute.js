"use strict";

const BUFFER_SIZE = 1000;

const shaders = `
@group(0) @binding(0)
var<storage, read_write> output: array<f32>;

@compute @workgroup_size(64)
fn main(
  @builtin(global_invocation_id)
  global_id : vec3u,

  @builtin(local_invocation_id)
  local_id : vec3u,
) {
  // Avoid accessing the buffer out of bounds
  if (global_id.x >= ${BUFFER_SIZE}) {
    return;
  }

  output[global_id.x] =
    f32(global_id.x) * 1000. + f32(local_id.x);
}
`;

async function init() {
  // navigator.gpuプロパティは現在の状態のGPUオブジェクトを返す
  if (!navigator.gpu) {
    throw Error("WebGPU not supported.");
  }

  // GPU.requestAdapter() メソッドでアダプタにアクセスします。このメソッドは、オプションの設定オブジェクトを受け入れ、例えば、高性能または低エネルギーアダプタを要求することができます。
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    throw Error("Couldn\'t request WebGPU adapter.");
  }

  // デバイスは GPUAdapter.requestDevice() で要求することができます。このメソッドは、論理デバイスに持たせたい機能や制限を正確に指定するために使用できる、オプションオブジェクト（ディスクリプタと呼ばれる）も受け付けます。
  const device = await adapter.requestDevice();

  // シェーダーコードをWebGPUで利用するために、createShaderModule()を呼び出してModuleの中に入れる必要が有る
  // シェーダーとはGPU上で実行される任意にプログラムを指す用語
  const shaderModule = device.createShaderModule({
    code: shaders,
  });

  // GPUの計算結果を高速に書き込むための出力バッファ
  const output = device.createBuffer({
    size: BUFFER_SIZE,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });

  // 出力内容をコピーするためのバッファで、JavaScriptが値にアクセスできるようにマッピングすることができる
  const stagingBuffer = device.createBuffer({
    size: BUFFER_SIZE,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });

  // パイプラインが作成されるときにバインドグループを指定する。バインドグループのレイアウトをはじめに作成する。これはバッファなどのGPUリソースの構造と目的を定義している。
  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.COMPUTE,
        buffer: {
          type: "storage",
        },
      },
    ],
  });

  // bindgroupを作成する。これにはレイアウトとレイアウトに記述されたバインドの番号を宣言し、先に定義した出力バッファをバインドするように指定する。
  // bindgroup:グループ内で結合されるリソースセットに関してやシェーダステージでリソースがどのように使用されるかを定義する。
  const bindGroup = device.createBindGroup({
    layout: bindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: {
          buffer: output,
        },
      },
    ],
  });


}
