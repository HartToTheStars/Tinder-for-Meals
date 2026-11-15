// Harvests recipes from favorite sites (RSS + sitemaps) into meals_recipes.
// Food52 sits behind a Vercel bot checkpoint (429 from server IPs), so it's skipped.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";
const PER_SOURCE = 120; // new recipes per source per run, keeps the deck balanced
const OG_BUDGET = 60; // page fetches per source per run

type Cand = { url: string; title?: string; image?: string | null; description?: string | null; published_at?: string | null };
type Source = { name: string; collect: () => Promise<Cand[]> };

const decode = (s: string) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
    .replace(/&rsquo;|&lsquo;/g, "'").replace(/&rdquo;|&ldquo;/g, '"').replace(/&hellip;/g, "…").replace(/&ndash;|&mdash;/g, "-");
const tag = (xml: string, name: string) => {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decode(m[1]).trim() : "";
};
const strip = (html: string) => decode(html).replace(/<[^>]+>/g, " ").replace(/READ MORE\.*/i, "").replace(/\s+/g, " ").trim();
const clip = (s: string | null | undefined, n = 200) => {
  if (!s) return null;
  s = s.replace(/\s*(Continue reading|Read more|The post .*)$/i, "").trim();
  return s.length > n ? s.slice(0, s.lastIndexOf(" ", n)) + "…" : s || null;
};
const titleFromSlug = (url: string) => {
  const slug = new URL(url).pathname.split("/").filter(Boolean).pop() ?? "";
  const small = new Set(["a", "an", "and", "or", "the", "with", "of", "in", "on", "for", "to"]);
  return slug.replace(/-\d{5,}$/, "").replace(/-recipe$/, "").split("-").map((w, i) => (i && small.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(" ");
};
const shuffle = <T,>(a: T[]) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

async function get(url: string) {
  try {
    const r = await fetch(url, { headers: { "user-agent": UA, accept: "text/html,application/xml;q=0.9,*/*;q=0.8", "accept-language": "en-US,en;q=0.9" } });
    return r.ok ? await r.text() : "";
  } catch { return ""; }
}

function itemImage(item: string): string | null {
  const pats = [
    /<media:content[^>]+url="([^"]+)"/i,
    /<media:thumbnail[^>]+url="([^"]+)"/i,
    /<g:image_link>([^<]+)</i,
    /<enclosure[^>]+url="([^"]+\.(?:jpe?g|png|webp)[^"]*)"/i,
    /<img[^>]+src="([^"]+)"/i,
    /&lt;img[^]*?src=(?:"|&quot;)([^"&]+)/i,
  ];
  for (const p of pats) { const m = item.match(p); if (m) return decode(m[1]); }
  return null;
}

async function rss(feed: string, keep: (item: string, url: string) => boolean = () => true): Promise<Cand[]> {
  const xml = await get(feed);
  return (xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? []).flatMap((item) => {
    const url = decode(tag(item, "link")).split("?")[0];
    if (!url || !keep(item, url)) return [];
    const pub = tag(item, "pubDate");
    return [{ url, title: strip(tag(item, "title")), image: itemImage(item), description: clip(strip(tag(item, "description"))), published_at: pub ? new Date(pub).toISOString() : null }];
  });
}

async function sitemap(urls: string[], keep: (u: string) => boolean = () => true): Promise<Cand[]> {
  const xmls = await Promise.all(urls.map(get));
  return xmls.flatMap((xml) => (xml.match(/<url>[\s\S]*?<\/url>/gi) ?? []).flatMap((block) => {
    const url = tag(block, "loc");
    if (!url || !keep(url)) return [];
    const img = block.match(/<image:loc>([^<]+)<\/image:loc>/i);
    const lm = tag(block, "lastmod");
    return [{ url, image: img ? decode(img[1]) : null, published_at: lm ? new Date(lm).toISOString() : null }];
  }));
}

async function og(url: string) {
  const html = await get(url);
  const meta = (p: string) => {
    const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${p}["'][^>]*content=["']([^"']+)["']`, "i")) ||
      html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${p}["']`, "i"));
    return m ? decode(m[1]) : null;
  };
  return { title: meta("og:title")?.replace(/\s*[|\-–]\s*(Bon App[ée]tit|Smitten Kitchen|Half Baked Harvest|The Kitchn|Kitchn).*$/i, ""), image: meta("og:image"), description: meta("og:description") ?? meta("description") };
}

// Monthly sitemaps (sitemap-YYYY-MM.xml), newest first. Bon Appétit and The Kitchn both publish them.
const months = (n: number, site = "https://www.bonappetit.com") => Array.from({ length: n }, (_, i) => {
  const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - i);
  return `${site}/sitemap-${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}.xml`;
});
// The Kitchn's recipe posts end in -recipe-<id>; reviews, roundups and shopping posts don't.
const KITCHN_RECIPE = /-recipe-\d+\/?$/;
const SK_SKIP = /\/(about|faq|contact|recipes|category|tag|page|book|press|cookbook|surprise-me)\//;

const SOURCES: Source[] = [
  {
    name: "Smitten Kitchen",
    collect: async () => [
      ...(await rss("https://smittenkitchen.com/feed/")),
      ...(await sitemap(["https://smittenkitchen.com/sitemap.xml"], (u) => /\/\d{4}\/\d{2}\/[^/]+\/$/.test(u) && !SK_SKIP.test(u))),
    ],
  },
  {
    name: "Half Baked Harvest",
    collect: async () => [
      ...(await rss("https://www.halfbakedharvest.com/feed/")),
      ...(await sitemap([1, 2, 3, 4].map((i) => `https://www.halfbakedharvest.com/post-sitemap${i === 1 ? "" : i}.xml`))),
    ],
  },
  {
    name: "Bon Appétit",
    collect: async () => [
      ...(await rss("https://www.bonappetit.com/feed/recipes-rss-feed/rss", (_, u) => u.includes("/recipe/"))),
      ...(await sitemap(months(18), (u) => u.includes("/recipe/"))),
    ],
  },
  {
    name: "The Kitchn",
    // The RSS feed is only the 20 latest posts and mostly shopping/news, so most recipes come from the monthly sitemaps.
    collect: async () => [
      ...(await rss("https://www.thekitchn.com/main.rss", (_, u) => KITCHN_RECIPE.test(u))),
      ...(await sitemap(months(12, "https://www.thekitchn.com"), (u) => KITCHN_RECIPE.test(u))),
    ],
  },
];

async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  const q = [...items];
  await Promise.all(Array.from({ length: n }, async () => { while (q.length) await fn(q.shift()!); }));
}

Deno.serve(async (req) => {
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, apikey, content-type, x-client-info" };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const seen = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data } = await db.from("meals_recipes").select("url").range(from, from + 999);
    (data ?? []).forEach((r) => seen.add(r.url));
    if (!data || data.length < 1000) break;
  }

  const report: Record<string, unknown> = {};
  const rows: Record<string, unknown>[] = [];

  await Promise.all(SOURCES.map(async (src) => {
    const all = await src.collect().catch(() => [] as Cand[]);
    const uniq = new Map<string, Cand>();
    for (const c of all) {
      if (seen.has(c.url)) continue;
      const prev = uniq.get(c.url);
      uniq.set(c.url, prev ? { ...c, ...prev, image: prev.image ?? c.image } : c);
    }
    // Fresh RSS items first (they have titles), then a random sample of the archive.
    const fresh = [...uniq.values()].filter((c) => c.title);
    const archive = shuffle([...uniq.values()].filter((c) => !c.title));
    const picks = [...fresh, ...archive].slice(0, PER_SOURCE);
    let budget = OG_BUDGET, added = 0;
    await pool(picks, 6, async (c) => {
      const needsOg = !c.image || ((src.name === "Bon Appétit" || src.name === "The Kitchn") && (!c.title || !c.description));
      if (needsOg && budget-- > 0) {
        const m = await og(c.url);
        c.image ??= m.image; c.title ??= m.title ?? undefined; c.description ??= clip(m.description);
      }
      if (!c.image) return;
      rows.push({ url: c.url, source: src.name, title: c.title || titleFromSlug(c.url), image: c.image, description: c.description ?? null, published_at: c.published_at ?? null });
      added++;
    });
    report[src.name] = { candidates: uniq.size, added };
  }));

  let error = null;
  if (rows.length) ({ error } = await db.from("meals_recipes").upsert(rows, { onConflict: "url", ignoreDuplicates: true }));
  return new Response(JSON.stringify({ added: error ? 0 : rows.length, error, report }), { headers: { ...cors, "content-type": "application/json" } });
});
