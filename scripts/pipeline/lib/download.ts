/**
 * Streaming "download if missing" helper shared by fetch-kess.ts (and any
 * future pipeline step that needs to pull a large file once and re-use it).
 */
import { createWriteStream, existsSync, readFileSync, renameSync, statSync } from "node:fs";
import { mkdir, unlink } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline as streamPipeline } from "node:stream/promises";
import type { ReadableStream as NodeWebReadableStream } from "node:stream/web";

const LOG_EVERY_BYTES = 2 * 1024 * 1024; // 2MB

function formatMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * Downloads `url` to `destPath` unless a file already exists there (in which
 * case it logs and returns immediately — re-running the pipeline is cheap).
 * Streams to a `.part` temp file and only renames into place once the
 * download completes, so a crash mid-download never leaves a corrupt file
 * that looks "present" on the next run.
 */
export async function downloadIfMissing(url: string, destPath: string): Promise<void> {
  if (existsSync(destPath)) {
    const { size } = statSync(destPath);
    console.log(`[download] skip (already exists, ${formatMB(size)}): ${destPath}`);
    return;
  }

  await mkdir(path.dirname(destPath), { recursive: true });
  const partPath = `${destPath}.part`;

  console.log(`[download] GET ${url}`);
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`[download] failed: HTTP ${response.status} ${response.statusText} for ${url}`);
  }

  const nodeReadable = Readable.fromWeb(response.body as unknown as NodeWebReadableStream<Uint8Array>);

  let downloaded = 0;
  let lastLogged = 0;
  nodeReadable.on("data", (chunk: Buffer) => {
    downloaded += chunk.length;
    if (downloaded - lastLogged >= LOG_EVERY_BYTES) {
      lastLogged = downloaded;
      console.log(`[download]   ${formatMB(downloaded)} ...`);
    }
  });

  try {
    await streamPipeline(nodeReadable, createWriteStream(partPath));
  } catch (err) {
    await unlink(partPath).catch(() => {});
    throw err;
  }

  // A portal error page served with HTTP 200 must not become a permanent
  // "already exists" file: spreadsheets and archives must be ZIP containers.
  if (/\.(xlsx|zip)$/i.test(destPath)) {
    const head = readFileSync(partPath).subarray(0, 4);
    if (head.length < 4 || head[0] !== 0x50 || head[1] !== 0x4b) {
      await unlink(partPath).catch(() => {});
      throw new Error(`[download] not a ZIP/XLSX file (${formatMB(downloaded)}): ${url}`);
    }
  }

  renameSync(partPath, destPath);
  console.log(`[download] done (${formatMB(statSync(destPath).size)}): ${destPath}`);
}
