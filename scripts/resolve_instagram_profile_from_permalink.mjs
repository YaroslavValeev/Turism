#!/usr/bin/env node
/**
 * По permalink Instagram (/reel/, /p/, /tv/) пытается извлечь username автора
 * через HTML embed /captioned/ (без API токена).
 *
 * Usage: node scripts/resolve_instagram_profile_from_permalink.mjs <url> [<url> ...]
 */
const urls = process.argv.slice(2).filter((a) => a.startsWith("http"));
if (!urls.length) {
  console.error("Usage: node scripts/resolve_instagram_profile_from_permalink.mjs <instagram-url> [...]");
  process.exit(1);
}

function toEmbedCaptioned(permalink) {
  try {
    const u = new URL(permalink);
    if (!u.hostname.replace(/^www\./i, "").endsWith("instagram.com")) return null;
    const path = u.pathname.replace(/\/+$/, "");
    return `https://www.instagram.com${path}/embed/captioned/`;
  } catch {
    return null;
  }
}

function extractProfileFromEmbedHtml(html) {
  const m =
    /href="https:\/\/www\.instagram\.com\/([^"/?]+)\/\?utm_source=ig_embed/i.exec(html) ||
    /instagram\.com\/([^"/?]+)\/\?utm_source=ig_embed/i.exec(html);
  return m ? m[1].replace(/^@/, "") : null;
}

async function resolveOne(permalink) {
  const embed = toEmbedCaptioned(permalink);
  if (!embed) return { permalink, error: "not_instagram_url" };
  const res = await fetch(embed, {
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; MyWaveSourceResolver/1.0)",
      accept: "text/html",
    },
  });
  const html = await res.text();
  const username = extractProfileFromEmbedHtml(html);
  if (!username) return { permalink, status: res.status, error: "username_not_found" };
  return {
    permalink,
    profileUrl: `https://www.instagram.com/${username}/`,
    username,
  };
}

const results = [];
for (const u of urls) {
  // eslint-disable-next-line no-await-in-loop
  results.push(await resolveOne(u));
}
console.log(JSON.stringify(results, null, 2));
