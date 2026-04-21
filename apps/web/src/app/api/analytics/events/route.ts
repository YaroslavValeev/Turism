import { NextResponse } from "next/server";
import { getAnalyticsProxyEnv } from "../../../../lib/analytics/serverProxyEnv";

export async function POST(req: Request) {
  const { apiUrl, token } = getAnalyticsProxyEnv();
  if (!token) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "INTERNAL_ANALYTICS_TOKEN (or TARGET_INTERNAL_TOKEN) is not configured for apps/web server env — see apps/web/.env.example",
      },
      { status: 503 }
    );
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const upstream = await fetch(`${apiUrl.replace(/\/+$/, "")}/internal/analytics/events`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const text = await upstream.text();
  return new NextResponse(text, {
    status: upstream.status,
    headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
  });
}
