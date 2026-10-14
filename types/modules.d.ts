// pdf.js 的 worker 模块没有类型声明；我们只在主线程里把它挂到 globalThis.pdfjsWorker 上
declare module "pdfjs-dist/build/pdf.worker.min.mjs" {
  export const WorkerMessageHandler: unknown;
}
