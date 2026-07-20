import { fetchSafeImage, MediaProxyError, type SafeImageFetchOptions } from "./security";

type MediaRequest = {
  nextUrl: URL;
};

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&apos;",
    };
    return entities[character];
  });
}

function buildPlaceholderSvg(url: string): string {
  const host = (() => {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return "media";
    }
  })();

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900" fill="none">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1200" y2="900" gradientUnits="userSpaceOnUse">
      <stop stop-color="#E5F7F5"/>
      <stop offset="1" stop-color="#F6F2E8"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="900" rx="48" fill="url(#bg)"/>
  <rect x="72" y="72" width="1056" height="756" rx="36" fill="#F8FBFA" stroke="#BFE8E3" stroke-width="4"/>
  <text x="108" y="184" fill="#147A78" font-family="Arial, sans-serif" font-size="36" font-weight="700">MyWaveTour</text>
  <text x="108" y="248" fill="#22313F" font-family="Arial, sans-serif" font-size="60" font-weight="700">Фото программы обновляется</text>
  <text x="108" y="326" fill="#5E6B73" font-family="Arial, sans-serif" font-size="32">Источник: ${escapeXml(host)}</text>
</svg>`.trim();
}

const SAFE_RESPONSE_HEADERS = {
  "cache-control": "public, max-age=3600",
  "x-content-type-options": "nosniff",
};

function placeholderResponse(url: string): Response {
  return new Response(buildPlaceholderSvg(url), {
    status: 200,
    headers: {
      ...SAFE_RESPONSE_HEADERS,
      "cache-control": "public, max-age=900",
      "content-security-policy": "default-src 'none'; sandbox",
      "content-type": "image/svg+xml; charset=utf-8",
    },
  });
}

export async function handleMediaRequest(
  request: MediaRequest,
  options: SafeImageFetchOptions = {},
): Promise<Response> {
  const remoteUrl = request.nextUrl.searchParams.get("url");
  if (!remoteUrl) return new Response("Missing url", { status: 400 });

  try {
    const image = await fetchSafeImage(remoteUrl, options);
    return new Response(image.body, {
      status: 200,
      headers: {
        ...SAFE_RESPONSE_HEADERS,
        "content-type": image.contentType,
      },
    });
  } catch (error) {
    if (error instanceof MediaProxyError) {
      if (error.code === "INVALID_URL") return new Response("Invalid url", { status: 400 });
      if (error.code === "FORBIDDEN_TARGET") return new Response("Forbidden", { status: 403 });
    }
    return placeholderResponse(remoteUrl);
  }
}
