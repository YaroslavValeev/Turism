import { readFile } from "node:fs/promises";
import path from "node:path";

// `next start` отдаёт из public/ только файлы, существовавшие при старте сервера;
// API докачивает медиа в общий volume позже — такие файлы читаем с диска здесь.
export const dynamic = "force-dynamic";

const MEDIA_DIR = path.join(process.cwd(), "public", "ingestion-media");

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  avif: "image/avif",
  svg: "image/svg+xml",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
};

export async function GET(_request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await context.params;
  const filename = segments?.length === 1 ? segments[0]! : "";
  if (!/^[A-Za-z0-9._-]+$/.test(filename) || filename.startsWith(".")) {
    return new Response("Not found", { status: 404 });
  }

  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  const contentType = CONTENT_TYPES[extension];
  if (!contentType) return new Response("Not found", { status: 404 });

  try {
    const body = await readFile(path.join(MEDIA_DIR, filename));
    return new Response(new Uint8Array(body), {
      status: 200,
      headers: {
        "content-type": contentType,
        "cache-control": "public, max-age=604800, immutable",
        ...(extension === "svg" ? { "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'" } : {}),
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
