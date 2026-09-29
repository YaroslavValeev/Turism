/**
 * Read-only диагностика Instagram-сбора: почему не парсятся посты/медиа.
 * Ничего не пишет в БД и не печатает секреты (только ok/missing, HTTP-статусы и счётчики).
 * Запуск: pnpm --filter api exec tsx scripts/instagram-probe.ts <username> [<username> ...]
 * На VPS: docker compose … exec -T api sh -c 'cd /app/services/api && pnpm exec tsx scripts/instagram-probe.ts da.wake'
 */
import { proxyAwareFetch } from "../src/lib/proxyFetch";
import { extractInstagramEdgeMedia } from "../src/modules/ingestion/instagramMedia";
import { instagramProxyForUrl, instagramSessionHeaders } from "../src/modules/ingestion/instagramProxy";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135 Safari/537.36";

type TimelineNode = Record<string, unknown> & { shortcode?: string; __typename?: string };

async function probe(username: string): Promise<boolean> {
  const url = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`;
  const proxy = instagramProxyForUrl(url);
  const session = instagramSessionHeaders(url);
  console.log(`\n=== @${username} ===`);
  console.log(`proxy=${proxy ? "on" : "OFF"} session=${session.cookie ? "on" : "OFF"}`);

  const response = await proxyAwareFetch(
    url,
    {
      headers: {
        "user-agent": USER_AGENT,
        accept: "*/*",
        "x-ig-app-id": "936619743392459",
        "x-requested-with": "XMLHttpRequest",
        referer: `https://www.instagram.com/${username}/`,
        ...session,
      },
      signal: AbortSignal.timeout(20000),
    },
    proxy,
  );
  console.log(`web_profile_info HTTP ${response.status}`);
  if (!response.ok) {
    if (response.status === 429) console.log("hint: rate limit по IP — нужен/не работает INSTAGRAM_HTTP_PROXY");
    if (response.status === 401 || response.status === 403) console.log("hint: нужна/протухла INSTAGRAM_SESSION_ID");
    if (response.status === 404) console.log("hint: профиль не найден или закрыт");
    return false;
  }

  const payload = (await response.json().catch(() => null)) as {
    data?: { user?: { is_private?: boolean; edge_owner_to_timeline_media?: { edges?: Array<{ node?: TimelineNode }> } } };
  } | null;
  const user = payload?.data?.user;
  if (!user) {
    console.log("hint: ответ без data.user — вероятно, Instagram вернул страницу логина (сессия)");
    return false;
  }
  const nodes = (user.edge_owner_to_timeline_media?.edges ?? []).map((e) => e.node).filter(Boolean) as TimelineNode[];
  console.log(`private=${Boolean(user.is_private)} posts_in_response=${nodes.length}`);

  let firstImage: string | null = null;
  for (const node of nodes.slice(0, 12)) {
    const media = extractInstagramEdgeMedia(node);
    const images = media.filter((m) => m.mediaType === "image").length;
    const videos = media.length - images;
    console.log(`post ${node.shortcode ?? "?"} type=${node.__typename ?? "?"} images=${images} videos=${videos}`);
    firstImage ??= media.find((m) => m.mediaType === "image")?.url ?? null;
  }

  if (firstImage) {
    const mediaProxy = instagramProxyForUrl(firstImage);
    const media = await proxyAwareFetch(
      firstImage,
      { headers: { "user-agent": USER_AGENT, referer: "https://www.instagram.com/" }, signal: AbortSignal.timeout(30000) },
      mediaProxy,
    );
    const host = new URL(firstImage).hostname;
    console.log(`first_image_download host=${host} proxy=${mediaProxy ? "on" : "OFF"} HTTP ${media.status} type=${media.headers.get("content-type")}`);
    return media.ok;
  }
  console.log("hint: в постах нет медиа");
  return nodes.length > 0;
}

async function main() {
  const usernames = process.argv.slice(2).map((u) => u.replace(/^@/, "").trim()).filter(Boolean);
  if (usernames.length === 0) {
    console.error("usage: tsx scripts/instagram-probe.ts <username> [<username> ...]");
    process.exitCode = 2;
    return;
  }
  let ok = true;
  for (const username of usernames) {
    try {
      ok = (await probe(username)) && ok;
    } catch (error) {
      ok = false;
      console.log(`error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  process.exitCode = ok ? 0 : 1;
}

void main();
