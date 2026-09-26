import "server-only";

/**
 * Crypto headlines from publishers' public RSS feeds.
 *
 * Feeds are third-party input, so everything is treated as untrusted: titles
 * are reduced to plain text (React escapes them again on render), and links
 * must be https URLs on the publisher's own domain. Cached for 10 minutes; a
 * failing feed is skipped rather than breaking the widget.
 */
export type Headline = { title: string; url: string; source: string; publishedAt: string };

const FEEDS = [
  { source: "Cointelegraph", url: "https://cointelegraph.com/rss", host: "cointelegraph.com" },
  { source: "Decrypt", url: "https://decrypt.co/feed", host: "decrypt.co" },
  { source: "The Block", url: "https://www.theblock.co/rss.xml", host: "theblock.co" },
  { source: "CoinDesk", url: "https://www.coindesk.com/arc/outboundfeeds/rss/", host: "coindesk.com" },
];
const TTL_MS = 10 * 60_000;

let cache: { data: Headline[]; expires: number } | null = null;

export async function getHeadlines(limit = 8): Promise<Headline[]> {
  if (!cache || cache.expires <= Date.now()) {
    const results = await Promise.allSettled(FEEDS.map(fetchFeed));
    const all = results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
    if (all.length > 0 || !cache) {
      all.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
      cache = { data: dedupe(all), expires: Date.now() + TTL_MS };
    }
  }
  return cache.data.slice(0, limit);
}

async function fetchFeed(feed: (typeof FEEDS)[number]): Promise<Headline[]> {
  const res = await fetch(feed.url, {
    headers: {
      "User-Agent": "OrbtradeNews/1.0 (+https://orbtrade.example)",
      Accept: "application/rss+xml, application/xml",
    },
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`${feed.source} ${res.status}`);
  const xml = (await res.text()).slice(0, 2_000_000);

  const items: Headline[] = [];
  for (const [, item] of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/g)) {
    const title = plainText(tag(item, "title"));
    const url = safeLink(tag(item, "link") || tag(item, "guid"), feed.host);
    const date = new Date(tag(item, "pubDate") || tag(item, "dc:date"));
    if (!title || !url || Number.isNaN(date.getTime())) continue;
    items.push({ title: title.slice(0, 200), url, source: feed.source, publishedAt: date.toISOString() });
    if (items.length >= 15) break;
  }
  return items;
}

function tag(xml: string, name: string): string {
  const m = xml.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`));
  if (!m) return "";
  return m[1].replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1").trim();
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function plainText(s: string): string {
  return s
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, " ")
    .trim();
}

function safeLink(raw: string, host: string): string | null {
  try {
    const u = new URL(plainText(raw));
    if (u.protocol !== "https:" || !(u.hostname === host || u.hostname.endsWith(`.${host}`))) return null;
    // Drop tracking parameters added by the feeds.
    for (const p of [...u.searchParams.keys()]) if (p.startsWith("utm_")) u.searchParams.delete(p);
    return u.toString();
  } catch {
    return null;
  }
}

function dedupe(items: Headline[]): Headline[] {
  const seen = new Set<string>();
  return items.filter((h) => {
    const key = h.title.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
