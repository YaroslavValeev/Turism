import { fetchSafeImage, MediaProxyError, type SafeImageFetchOptions } from "./security";

type MediaRequest = {
  nextUrl: URL;
};

function buildPlaceholderSvg(): string {
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675" fill="none" role="img" aria-label="Фото программы уточняется">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1200" y2="675" gradientUnits="userSpaceOnUse">
      <stop stop-color="#EEF8F5"/>
      <stop offset="1" stop-color="#DCECE6"/>
    </linearGradient>
    <linearGradient id="wave" x1="160" y1="0" x2="980" y2="0" gradientUnits="userSpaceOnUse">
      <stop stop-color="#8FD1C4"/>
      <stop offset="1" stop-color="#5FB5A5"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="675" fill="url(#bg)"/>
  <rect x="36" y="36" width="1128" height="603" rx="36" fill="rgba(255,255,255,0.35)" stroke="rgba(53,120,108,0.22)" stroke-width="2"/>
  <g fill="none" stroke="url(#wave)" stroke-width="22" stroke-linecap="round" stroke-linejoin="round" opacity="0.96">
    <path d="M180 430c90-38 150-92 238-148 90-56 155-68 240-16 86 52 156 128 282 138"/>
    <path d="M190 495c112 18 170 0 248-40 76-40 124-86 210-80 90 6 156 82 282 102"/>
  </g>
  <g transform="translate(502 214)">
    <rect x="-66" y="-66" width="132" height="132" rx="28" fill="rgba(255,255,255,0.7)" stroke="rgba(53,120,108,0.22)" stroke-width="3"/>
    <path d="M-30 22l18-22 18 18 14-16 24 30" stroke="#4F9F91" stroke-width="9" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="-4" cy="-20" r="10" fill="#6AB5A7"/>
  </g>
  <text x="80" y="560" fill="#2C7F70" font-family="Arial, sans-serif" font-size="48" font-weight="700">MyWaveTour</text>
  <text x="80" y="612" fill="#3F6D66" font-family="Arial, sans-serif" font-size="34" font-weight="500">Фото программы уточняется</text>
</svg>`.trim();
}

const SAFE_RESPONSE_HEADERS = {
  "cache-control": "public, max-age=3600",
  "x-content-type-options": "nosniff",
};

function placeholderResponse(): Response {
  return new Response(buildPlaceholderSvg(), {
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
    return placeholderResponse();
  }
}
