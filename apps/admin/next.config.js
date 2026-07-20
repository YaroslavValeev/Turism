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

// Static next.config headers cannot attach a per-request nonce. Next's App Router
// emits inline bootstrap scripts, and this app uses React style attributes, so
// unsafe-inline remains narrowly enabled for scripts/styles. unsafe-eval is never allowed.
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline'",
  "script-src-attr 'none'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src ${sources(["'self'", apiOrigin])}`,
  "frame-src 'self'",
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
