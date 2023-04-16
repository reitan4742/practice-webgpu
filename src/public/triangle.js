"use strict";

const shaders = `
struct VertexOut {
  @builtin(position) position : vec4f,
  @location(0) color : vec4f
}

@vertex
fn vertex_main(@location(0) position: vec4f,
               @location(1) color: vec4f) -> VertexOut
{
  var output : VertexOut;
  output.position = position;
  output.color = color;
  return output;
}

@fragment
fn fragment_main(fragData: VertexOut) -> @location(0) vec4f
{
  return fragData.color;
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
  const shaderModule = device.createShaderModule({
    code: shaders,
  });

  const canvas = document.querySelector("#gpuCanvas");
  const context = canvas.getContext("webgpu");

  // .configure()を呼び出してコンテキストを設定し、レンダリング情報を取得するdevice、テクスチャのフォーマットなどを渡す。
  // getPreferredCanvasFormat()はデバイスにとって最も効率のいいフォーマットを決定してくれるらしい
  context.configure({
    device: device,
    format: navigator.gpu.getPreferredCanvasFormat(),
    alphaMode: "premultiplied",
  });

  // 次に、WebGPU プログラムが使用できる形式で、データを提供します。このデータには、三角形の各頂点に対応する8つのデータポイント（位置はX、Y、Z、W、色はR、G、B、A）が含まれています。
  const vertices = new Float32Array([
    0.0, 0.6, 0, 1, 1, 0, 0, 1,
    -0.5, -0.6, 0, 1, 0, 1, 0, 1,
    0.5, -0.6, 0, 1, 0, 0, 1, 1,
  ]);


  // GPUBufferはGPUDevice.createBuffer()を呼び出すことで作成されます。すべてのデータを格納できるように頂点配列の長さに等しいサイズを与え、バッファが頂点バッファとコピー操作の宛先として使用されることを示すためにVERTEXとCOPY_DSTの使用フラグを与えています。
  const vertexBuffer = device.createBuffer({
    size: vertices.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });

  // GPUからJavaScriptにデータを読み込むコンピュートパイプラインの例のように、マッピング操作を使ってGPUBufferにデータを取り込むこともできます。このメソッドは、書き込むバッファ、書き込むデータソース、それぞれのオフセット値、書き込むデータサイズ（ここでは配列の全長を指定しています）をパラメータとして受け取ります。そして、ブラウザはデータの書き込みを処理する最も効率的な方法を考え出します。
  device.queue.writeBuffer(vertexBuffer, 0, vertices, 0, vertices.length);

  // ここからレンダーパイプラインらしい

  // まず、頂点データの必要なレイアウトを記述したオブジェクトを作成します。これは、先ほどの頂点配列と頂点シェーダステージで見たものと完全に一致します - 各頂点は位置と色のデータを持っています。どちらもfloat32x4形式（WGSLのvec4<f32>型に対応）で、カラーデータは各頂点の16バイトのオフセットから始まります。 arrayStrideはストライド、つまり各頂点を構成するバイト数を指定し、stepModeはデータが頂点ごとにフェッチされることを指定します。
  const vertexBuffers = [
    {
      attributes: [
        {
          shaderLocation: 0, // position
          offset: 0,
          format: "float32x4",
        },
        {
          shaderLocation: 1, // color
          offset: 16,
          format: "float32x4",
        },
      ],
      arrayStride: 32,
      stepMode: "vertex",
    },
  ];


  // また、プリミティブの状態（この場合、描画するプリミティブの種類を示すだけ）と、レイアウトを auto で指定します。レイアウトプロパティは、パイプラインの実行中に使用されるすべてのGPUリソース（バッファ、テクスチャなど）のレイアウト（構造、目的、タイプ）を定義します。より複雑なアプリでは、GPUPipelineLayout オブジェクトを GPUDevice.createPipelineLayout() で作成します（Basic compute pipeline で例を見ることができます）これは、GPU が前もってパイプラインを最も効率的に実行する方法を把握することができます。シェーダーコードで定義されたバインディングに基づき、パイプラインが暗黙のバインドグループレイアウトを生成するようになります。
  const pipelineDescriptor = {
    vertex: {
      module: shaderModule,
      entryPoint: "vertex_main",
      buffers: vertexBuffers
    },
    fragment: {
      module: shaderModule,
      entryPoint: "fragment_main",
      targets: [
        {
          format: navigator.gpu.getPreferredCanvasFormat(),
        },
      ],
    },
    primitive: {
      topology: "triangle-list",
    },
    layout: "auto",
  };


  // 最後に、GPUDevice.createRenderPipeline()メソッド呼び出しのパラメータとしてそれを渡すことによって、pipelineDescriptorオブジェクトに基づいてGPURenderPipelineを作成することができます。
  const renderPipeline = device.createRenderPipeline(pipelineDescriptor);

  // 実際に実行する

  // これですべての設定が完了したので、実際にレンダリングパスを実行し、<canvas>に何かを描画することができます。GPUDevice.createCommandEncoder() を使って GPUCommandEncoder インスタンスを作成し、後で GPU に発行するコマンドをエンコードする必要があります。
  const commandEncoder = device.createCommandEncoder();

  const clearColor = { r: 0.0, g: 0.5, b: 1.0, a: 1.0 };

  const renderPassDescriptor = {
    colorAttachments: [
      {
        clearValue: clearColor,
        loadOp: "clear",
        storeOp: "store",
        view: context.getCurrentTexture().createView(),
      },
    ],
  };

  const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);

  // パイプラインの指定
  passEncoder.setPipeline(renderPipeline);
  // 頂点バッファの指定
  passEncoder.setVertexBuffer(0, vertexBuffer);
  // vertexBufferの中には頂点が3つあるので3を指定
  passEncoder.draw(3);

  // 一連のコマンドのエンコードを終えてGPUに発行するためには、さらに3つのステップが必要です。

  // GPURenderPassEncoder.end()メソッドを呼び出して、レンダーパスコマンドリストの終了を知らせます。
  passEncoder.end();
  // GPUCommandEncoder.finish()メソッドを呼び出して、発行されたコマンドシーケンスの記録を完了し、GPUCommandBufferオブジェクトインスタンスにカプセル化します。GPUCommandBufferをデバイスのコマンドキュー（GPUQueueインスタンスで表される）に投入して、GPUに送信します。デバイスのキューは GPUDevice.queue プロパティで利用でき、GPUCommandBuffer インスタンスの配列は GPUQueue.submit() 呼び出しでキューに追加することができます。
  device.queue.submit([commandEncoder.finish()]);

}

init();
