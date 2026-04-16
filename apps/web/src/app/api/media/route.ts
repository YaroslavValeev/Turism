import { NextRequest } from "next/server";

function isBlockedPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return true;
  if (host.endsWith(".local")) return true;
  if (host.startsWith("10.")) return true;
  if (host.startsWith("192.168.")) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
  return false;
}

function buildPlaceholderSvg(url: string): string {
  const host = (() => {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return "media";
    }
  })();

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900" fill="none">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1200" y2="900" gradientUnits="userSpaceOnUse">
      <stop stop-color="#E5F7F5"/>
      <stop offset="1" stop-color="#F6F2E8"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="900" rx="48" fill="url(#bg)"/>
  <rect x="72" y="72" width="1056" height="756" rx="36" fill="#F8FBFA" stroke="#BFE8E3" stroke-width="4"/>
  <text x="108" y="184" fill="#147A78" font-family="Arial, sans-serif" font-size="36" font-weight="700">MyWave Travel</text>
  <text x="108" y="248" fill="#22313F" font-family="Arial, sans-serif" font-size="66" font-weight="700">Изображение недоступно</text>
  <text x="108" y="326" fill="#5E6B73" font-family="Arial, sans-serif" font-size="32">Источник не отдал обложку или ссылка устарела.</text>
  <text x="108" y="410" fill="#7A8A94" font-family="Arial, sans-serif" font-size="28">Источник: ${host}</text>
</svg>`.trim();

  return svg;
}

export async function GET(request: NextRequest) {
  const remoteUrl = request.nextUrl.searchParams.get("url");
  if (!remoteUrl) {
    return new Response("Missing url", { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(remoteUrl);
  } catch {
    return new Response("Invalid url", { status: 400 });
  }

  if (!["http:", "https:"].includes(parsed.protocol) || isBlockedPrivateHost(parsed.hostname)) {
    return new Response("Forbidden", { status: 403 });
  }

  try {
    const referer =
      parsed.hostname.includes("instagram.com") ||
      parsed.hostname.includes("cdninstagram.com") ||
      parsed.hostname.includes("fbcdn.net")
        ? "https://www.instagram.com/"
        : parsed.hostname.includes("telesco.pe") || parsed.hostname.includes("telegram.org")
          ? "https://t.me/"
          : `${parsed.protocol}//${parsed.hostname}/`;

    const response = await fetch(parsed.toString(), {
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135 Safari/537.36",
        accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        referer,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const body = buildPlaceholderSvg(parsed.toString());
      return new Response(body, {
        status: 200,
        headers: {
          "content-type": "image/svg+xml; charset=utf-8",
          "cache-control": "public, max-age=900",
        },
      });
    }

    const contentType = response.headers.get("content-type") ?? "image/jpeg";
    const cacheControl = response.headers.get("cache-control") ?? "public, max-age=3600";
    const body = await response.arrayBuffer();

    return new Response(body, {
      status: 200,
      headers: {
        "content-type": contentType,
        "cache-control": cacheControl,
      },
    });
  } catch {
    const body = buildPlaceholderSvg(parsed.toString());
    return new Response(body, {
      status: 200,
      headers: {
        "content-type": "image/svg+xml; charset=utf-8",
        "cache-control": "public, max-age=900",
      },
    });
  }
}
