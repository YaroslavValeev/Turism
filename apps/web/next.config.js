const isProduction = process.env.NODE_ENV === "production";

function getHttpOrigin(value) {
  if (!value || value.startsWith("/")) return null;

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

function sources(values) {
  return [...new Set(values.filter(Boolean))].join(" ");
}

const apiOrigin = getHttpOrigin(process.env.NEXT_PUBLIC_API_URL);
const hasGa4 = Boolean(process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID);
const hasYandexMetrika = Boolean(process.env.NEXT_PUBLIC_YM_ID);

// Static next.config headers cannot attach a per-request nonce. Next's App Router
// emits inline bootstrap scripts, and this app uses React style attributes, so
// unsafe-inline remains narrowly enabled for scripts/styles. unsafe-eval is never allowed.
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  `script-src ${sources([
    "'self'",
    "'unsafe-inline'",
    hasGa4 && "https://www.googletagmanager.com",
    hasYandexMetrika && "https://mc.yandex.ru",
    hasYandexMetrika && "https://mc.yandex.com",
  ])}`,
  "script-src-attr 'none'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src ${sources([
    "'self'",
    apiOrigin,
    hasGa4 && "https://www.googletagmanager.com",
    hasGa4 && "https://www.google-analytics.com",
    hasGa4 && "https://*.google-analytics.com",
    hasYandexMetrika && "https://mc.yandex.ru",
    hasYandexMetrika && "https://mc.yandex.com",
  ])}`,
  `frame-src ${sources([
    "'self'",
    hasYandexMetrika && "https://mc.yandex.ru",
    hasYandexMetrika && "https://mc.yandex.com",
  ])}`,
  "media-src 'self' blob: https:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join("; ");

const securityHeaders = [
  ...(isProduction
    ? [{ key: "Content-Security-Policy", value: contentSecurityPolicy }]
    : []),
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value:
      "accelerometer=(), autoplay=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  transpilePackages: ["@mywave/shared-types"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

module.exports = nextConfig;
