process.env.APP_ENV = 'test';
import { prisma } from "./src/lib/prisma";

async function headStatus(url: string): Promise<{ status: number | null; contentType: string | null; error: string | null }> {
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      headers: { 'user-agent': 'Mozilla/5.0 Codex' },
    });
    return { status: res.status, contentType: res.headers.get('content-type'), error: null };
  } catch (error) {
    return { status: null, contentType: null, error: String(error) };
  }
}

async function main() {
  const programs = await prisma.program.findMany({
    where: { publishStatus: 'published' },
    orderBy: [{ startDate: 'asc' }, { createdAt: 'asc' }],
    select: {
      title: true,
      media: { select: { url: true }, orderBy: { id: 'asc' }, take: 1 }
    }
  });

  const risky: Array<Record<string, unknown>> = [];

  for (const program of programs) {
    const mediaUrl = program.media[0]?.url ?? null;
    if (!mediaUrl) {
      risky.push({ title: program.title, issue: 'no_media' });
      continue;
    }

    if (/^https?:\/\//i.test(mediaUrl)) {
      const info = await headStatus(mediaUrl);
      if (info.status == null || info.status >= 400) {
        risky.push({ title: program.title, issue: 'external_unreachable', mediaUrl, status: info.status, error: info.error });
      }
      continue;
    }

    if (/^\/media\/filmstrip\//i.test(mediaUrl)) {
      risky.push({ title: program.title, issue: 'generic_local_fallback', mediaUrl });
      continue;
    }

    if (/\.svg$/i.test(mediaUrl)) {
      risky.push({ title: program.title, issue: 'local_svg_generic', mediaUrl });
      continue;
    }
  }

  console.log(JSON.stringify({ publishedCount: programs.length, risky }, null, 2));
}

main().finally(() => prisma.$disconnect());
