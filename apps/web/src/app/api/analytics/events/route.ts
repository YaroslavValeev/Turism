import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const apiUrl = process.env.API_INTERNAL_BASE_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
  const token = process.env.INTERNAL_ANALYTICS_TOKEN;
  if (!token) {
    return NextResponse.json({ ok: false, error: "INTERNAL_ANALYTICS_TOKEN is not configured" }, { status: 503 });
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
