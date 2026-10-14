"use client";

/**
 * 附件（图片、PDF、Word、文本/代码文件）的读取、压缩与存储。
 *
 * 附件体积大，放进 localStorage 很快就会超出容量，所以单独存到 IndexedDB，
 * 消息里只保存 ImageRef / FileRef 这样的轻量引用。
 */
import { useEffect, useState } from "react";
import type { FilePayload, FileRef, ImagePayload, ImageRef } from "./types";
import { uid } from "./utils";

export const MAX_ATTACHMENTS = 10;
/** 单个文件的大小上限 */
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
/** 每个文件最多提取的文字数，避免超出模型的上下文 */
const MAX_TEXT_CHARS = 200_000;
/** Claude 建议长边不超过 1568px，更大的图片也会被模型端缩小，提前压缩可以减少流量 */
const MAX_EDGE = 1568;
/** 原图不超过这个大小且尺寸合适时直接使用，不重新编码 */
const KEEP_ORIGINAL_BYTES = 1.5 * 1024 * 1024;

export interface PreparedImage extends ImageRef {
  dataUrl: string;
}

export interface PreparedFile extends FileRef {
  text: string;
  /** PDF 原始数据（base64） */
  pdf?: string;
}

interface StoredFile {
  text: string;
  pdf?: string;
}

/** 文件选择框里允许的类型 */
export const ACCEPT =
  "image/*,.pdf,.docx,.txt,.md,.markdown,.csv,.tsv,.json,.jsonl,.xml,.yaml,.yml,.toml,.ini,.log,.html,.htm,.css,.scss,.js,.jsx,.ts,.tsx,.mjs,.cjs,.vue,.svelte,.py,.ipynb,.java,.kt,.kts,.c,.h,.cpp,.hpp,.cc,.cs,.go,.rs,.rb,.php,.swift,.m,.mm,.dart,.scala,.lua,.r,.sql,.sh,.bash,.zsh,.ps1,.bat,.tex,.srt,.vtt,.conf,.cfg,.env";

const TEXT_EXTENSIONS = new Set(
  ACCEPT.split(",")
    .filter((s) => s.startsWith("."))
    .map((s) => s.slice(1))
    .filter((s) => s !== "pdf" && s !== "docx"),
);

// ---------------- IndexedDB ----------------

const DB_NAME = "prism";
const STORE = "attachments";
let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** 内存缓存：图片 id → data URL，文件 id → 文字与 PDF 数据 */
const cache = new Map<string, string | StoredFile>();

async function read<T extends string | StoredFile>(id: string): Promise<T | undefined> {
  const hit = cache.get(id);
  if (hit) return hit as T;
  const value = await run<T>("readonly", (store) => store.get(id)).catch(() => undefined);
  if (value) cache.set(id, value);
  return value;
}

async function write(id: string, value: string | StoredFile) {
  cache.set(id, value);
  await run("readwrite", (store) => store.put(value, id));
}

export async function saveAttachments(images: PreparedImage[], files: PreparedFile[]) {
  for (const img of images) await write(img.id, img.dataUrl);
  for (const f of files) await write(f.id, { text: f.text, ...(f.pdf ? { pdf: f.pdf } : {}) });
}

export async function deleteAttachments(ids: string[]) {
  if (!ids.length) return;
  for (const id of ids) cache.delete(id);
  await run("readwrite", (store) => {
    for (const id of ids) store.delete(id);
  }).catch(() => {});
}

export async function clearAttachments() {
  cache.clear();
  await run("readwrite", (store) => store.clear()).catch(() => {});
}

/** 导出：把附件数据一起打包，导入时再写回 IndexedDB */
export async function exportAttachments(ids: string[]): Promise<Record<string, string | StoredFile>> {
  const out: Record<string, string | StoredFile> = {};
  for (const id of ids) {
    const value = await read(id);
    if (value) out[id] = value;
  }
  return out;
}

export async function importAttachments(data: Record<string, unknown>) {
  for (const [id, value] of Object.entries(data)) {
    if (typeof value === "string" && value.startsWith("data:image/")) await write(id, value);
    else if (value && typeof value === "object" && typeof (value as StoredFile).text === "string") await write(id, value as StoredFile);
  }
}

/** 读取消息里的附件，转换成发送给模型的格式；找不到的会被跳过 */
export async function loadPayloads(images: ImageRef[] = [], files: FileRef[] = []) {
  const imagePayloads: ImagePayload[] = [];
  for (const ref of images) {
    const dataUrl = await read<string>(ref.id);
    if (dataUrl) imagePayloads.push({ mimeType: ref.mimeType, data: dataUrl.slice(dataUrl.indexOf(",") + 1) });
  }
  const filePayloads: FilePayload[] = [];
  for (const ref of files) {
    const stored = await read<StoredFile>(ref.id);
    if (stored) filePayloads.push({ name: ref.name, kind: ref.kind, text: stored.text, ...(stored.pdf ? { pdf: stored.pdf } : {}) });
  }
  return { images: imagePayloads, files: filePayloads };
}

export function useImageSrc(id: string): string | undefined {
  const [src, setSrc] = useState(() => cache.get(id) as string | undefined);
  useEffect(() => {
    if (src) return;
    let alive = true;
    void read<string>(id).then((v) => alive && setSrc(v));
    return () => {
      alive = false;
    };
  }, [id, src]);
  return src;
}

// ---------------- 读取与转换 ----------------

export type AttachmentKind = "image" | FileRef["kind"];

function extension(name: string) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

/** 根据类型和扩展名判断附件种类；无法判断时返回 null */
export function classify(file: File): AttachmentKind | null {
  const ext = extension(file.name);
  if (file.type.startsWith("image/")) return "image";
  if (file.type === "application/pdf" || ext === "pdf") return "pdf";
  if (ext === "docx" || file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  if (file.type.startsWith("text/") || /json|xml|yaml|javascript|typescript|x-sh|x-python/.test(file.type) || TEXT_EXTENSIONS.has(ext)) {
    return "text";
  }
  return null;
}

function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** 把图片缩放到合适尺寸并编码成 data URL */
export async function prepareImage(file: Blob): Promise<PreparedImage> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    try {
      await img.decode();
    } catch {
      throw new Error("无法读取这张图片，可能是不支持的格式（例如 HEIC），请换成 JPG 或 PNG。");
    }
    const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));
    const id = uid();

    if (scale === 1 && file.size <= KEEP_ORIGINAL_BYTES && ["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      return { id, mimeType: file.type, width, height, dataUrl: await readAsDataUrl(file) };
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("无法处理图片");
    ctx.imageSmoothingQuality = "high";

    // 截图等带透明通道的图片优先保留 PNG（文字更清晰），太大再转 JPEG
    if (file.type !== "image/jpeg") {
      ctx.drawImage(img, 0, 0, width, height);
      const png = canvas.toDataURL("image/png");
      if (png.length * 0.75 <= KEEP_ORIGINAL_BYTES) return { id, mimeType: "image/png", width, height, dataUrl: png };
    }
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);
    return { id, mimeType: "image/jpeg", width, height, dataUrl: canvas.toDataURL("image/jpeg", 0.86) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 文本文件可能是 UTF-8，也可能是 GBK（Windows 上很多中文文本文件） */
function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("gb18030").decode(bytes);
  }
}

/** 粗略判断一段二进制数据是不是文本：前 4KB 里没有 0 字节 */
function looksLikeText(bytes: Uint8Array) {
  return !bytes.subarray(0, 4096).includes(0);
}

async function extractPdf(bytes: Uint8Array): Promise<{ text: string; pages: number }> {
  const pdfjs = await import("pdfjs-dist");
  // 在主线程里运行 pdf.js 的 worker，免去在网页 / 桌面 / 安卓三端分别部署 worker 文件
  const g = globalThis as { pdfjsWorker?: unknown };
  g.pdfjsWorker ??= await import("pdfjs-dist/build/pdf.worker.min.mjs");

  // pdf.js 会接管传入的数据，所以传一份副本
  const task = pdfjs.getDocument({ data: bytes.slice() });
  let doc;
  try {
    doc = await task.promise;
  } catch (err) {
    const name = (err as { name?: string })?.name;
    throw new Error(name === "PasswordException" ? "这个 PDF 设置了密码，无法读取。" : "无法解析这个 PDF 文件。");
  }
  const parts: string[] = [];
  let length = 0;
  for (let i = 1; i <= doc.numPages && length < MAX_TEXT_CHARS; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str + (item.hasEOL ? "\n" : "") : ""))
      .join("")
      .trim();
    page.cleanup();
    parts.push(`--- 第 ${i} 页 ---\n${text}`);
    length += text.length;
  }
  const pages = doc.numPages;
  await task.destroy();
  return { text: parts.join("\n\n"), pages };
}

/** 读取文件（PDF / Word / 文本），提取文字 */
export async function prepareFile(file: File, kind: Exclude<AttachmentKind, "image"> | null): Promise<PreparedFile> {
  if (file.size > MAX_FILE_BYTES) throw new Error(`「${file.name}」超过 20MB，太大了。`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  let text = "";
  let pages: number | undefined;
  let pdf: string | undefined;
  let resolved = kind;

  if (resolved === "pdf") {
    ({ text, pages } = await extractPdf(bytes));
    pdf = toBase64(bytes);
  } else if (resolved === "docx") {
    const mammoth = await import("mammoth");
    try {
      text = (await mammoth.extractRawText({ arrayBuffer: bytes.buffer })).value.trim();
    } catch {
      throw new Error(`无法读取「${file.name}」，请确认是 .docx 格式的 Word 文档（旧版 .doc 不支持）。`);
    }
  } else {
    if (!resolved && !looksLikeText(bytes)) throw new Error(`暂不支持「${file.name}」这种格式。`);
    resolved = "text";
    text = decodeText(bytes);
  }

  const truncated = text.length > MAX_TEXT_CHARS;
  if (truncated) text = text.slice(0, MAX_TEXT_CHARS);
  return {
    id: uid(),
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    kind: resolved,
    chars: text.length,
    ...(pages ? { pages } : {}),
    ...(truncated ? { truncated } : {}),
    text,
    ...(pdf ? { pdf } : {}),
  };
}

export function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function describeFile(f: FileRef) {
  const type = f.kind === "pdf" ? "PDF" : f.kind === "docx" ? "Word" : extension(f.name).toUpperCase() || "文本";
  return [type, f.pages ? `${f.pages} 页` : formatSize(f.size)].join(" · ");
}
