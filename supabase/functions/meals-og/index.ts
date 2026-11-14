// Open Graph images for forks (1200x630 PNG). Public (no JWT): crawlers fetch these directly.
//   ?r=<recipe uuid>   one recipe: full-bleed photo, title, source, forks wordmark
//   ?site=1            the site: a collage of recipe photos with the wordmark and tagline
import React from "https://esm.sh/react@18.2.0";
import { ImageResponse } from "https://deno.land/x/og_edge@0.0.6/mod.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const W = 1200, H = 630;
const CREAM = "#f7f1e8", INK = "#2a211c", TOMATO = "#e8553e", MUTED = "#8a7d72";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";
const h = React.createElement;

// Google Fonts serves TTF (which the renderer needs) when asked without a browser user agent.
async function font(family: string, weight: number) {
  const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${family}:wght@${weight}`)).text();
  const url = css.match(/src: url\((.+?)\)/)?.[1];
  return url ? await (await fetch(url)).arrayBuffer() : null;
}
let fontsP: Promise<{ name: string; data: ArrayBuffer; weight: number; style: string }[]> | null = null;
const fonts = () => (fontsP ??= Promise.all([font("Fraunces", 700), font("Inter", 600)]).then(([f, i]) => [
  ...(f ? [{ name: "Fraunces", data: f, weight: 700, style: "normal" }] : []),
  ...(i ? [{ name: "Inter", data: i, weight: 600, style: "normal" }] : []),
]));

// Fetch a photo server-side and inline it, so a slow or blocked image host can't break the render.
async function photo(url?: string | null) {
  if (!url) return null;
  try {
    const r = await fetch(url.replace(/^http:\/\//, "https://"), { headers: { "user-agent": UA, accept: "image/*" }, signal: AbortSignal.timeout(6000) });
    const type = r.headers.get("content-type") ?? "";
    if (!r.ok || !/image\/(jpe?g|png|webp)/.test(type)) return null;
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf.byteLength > 6_000_000) return null;
    let bin = "";
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return `data:${type.split(";")[0]};base64,${btoa(bin)}`;
  } catch { return null; }
}

const wordmark = (size: number, color = INK) =>
  h("div", { style: { display: "flex", fontFamily: "Fraunces", fontSize: size, color, letterSpacing: -1 } }, "forks", h("span", { style: { color: TOMATO } }, "."));

const SMALL = new Set(["a", "an", "and", "or", "the", "with", "of", "in", "on", "for", "to", "de", "y"]);
const smartTitle = (t: string) => (t === t.toLowerCase()
  ? t.split(" ").map((w, i) => (i && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(" ")
  : t).trim().replace(/\.$/, "");

function recipeCard(r: { title: string; source: string }, img: string | null) {
  const t = smartTitle(r.title);
  const title = t.length > 70 ? t.slice(0, 68) + "…" : t;
  if (!img) {
    return h("div", { style: { width: W, height: H, display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: CREAM } },
      wordmark(56),
      h("div", { style: { display: "flex", flexDirection: "column" } },
        h("div", { style: { fontFamily: "Inter", fontSize: 24, color: TOMATO, letterSpacing: 2, textTransform: "uppercase", marginBottom: 16 } }, r.source),
        h("div", { style: { fontFamily: "Fraunces", fontSize: 76, color: INK, lineHeight: 1.05 } }, title)),
      h("div", { style: { fontFamily: "Inter", fontSize: 26, color: MUTED } }, "meet your next meal."));
  }
  return h("div", { style: { width: W, height: H, display: "flex", position: "relative", background: INK } },
    h("img", { src: img, width: W, height: H, style: { position: "absolute", top: 0, left: 0, width: W, height: H, objectFit: "cover" } }),
    h("div", { style: { position: "absolute", top: 0, left: 0, width: W, height: H, display: "flex", background: "linear-gradient(to top, rgba(20,14,10,0.92) 0%, rgba(20,14,10,0.45) 45%, rgba(20,14,10,0) 70%)" } }),
    h("div", { style: { position: "absolute", top: 40, left: 48, display: "flex", padding: "10px 22px 12px", borderRadius: 999, background: CREAM } }, wordmark(38)),
    h("div", { style: { position: "absolute", left: 56, right: 56, bottom: 52, display: "flex", flexDirection: "column" } },
      h("div", { style: { display: "flex", alignSelf: "flex-start", fontFamily: "Inter", fontSize: 20, color: "#fff", letterSpacing: 2, textTransform: "uppercase", padding: "8px 16px", borderRadius: 999, background: "rgba(255,255,255,0.18)", marginBottom: 18 } }, r.source),
      h("div", { style: { fontFamily: "Fraunces", fontSize: 68, color: "#fff", lineHeight: 1.06 } }, title)));
}

function siteCard(imgs: (string | null)[]) {
  const tiles = imgs.filter(Boolean).slice(0, 3) as string[];
  const rot = [-7, 4, -2];
  return h("div", { style: { width: W, height: H, display: "flex", background: CREAM, position: "relative" } },
    h("div", { style: { display: "flex", flexDirection: "column", justifyContent: "center", paddingLeft: 80, width: 560 } },
      wordmark(120),
      h("div", { style: { fontFamily: "Fraunces", fontSize: 44, color: INK, marginTop: 6 } }, "meet your next meal."),
      h("div", { style: { fontFamily: "Inter", fontSize: 26, color: MUTED, marginTop: 22, lineHeight: 1.4 } }, "Swipe right on recipes you love. Keep the good ones.")),
    ...tiles.map((src, i) => h("div", {
      style: { position: "absolute", top: 70 + i * 20, left: 610 + i * 150, width: 300, height: 400, display: "flex", borderRadius: 28, overflow: "hidden", transform: `rotate(${rot[i]}deg)`, boxShadow: "0 24px 48px rgba(42,33,28,0.35)", border: "6px solid #fffdf9" },
    }, h("img", { src, width: 300, height: 400, style: { width: 300, height: 400, objectFit: "cover" } }))));
}

Deno.serve(async (req) => {
  const u = new URL(req.url);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const cache = { "cache-control": "public, max-age=86400, s-maxage=604800", "access-control-allow-origin": "*" };
  let el;
  if (u.searchParams.get("site")) {
    const { data } = await db.from("meals_recipes").select("image,source")
      .in("source", ["Smitten Kitchen", "Bon Appétit"]).not("image", "is", null).order("published_at", { ascending: false }).limit(8);
    const imgs = (await Promise.all((data ?? []).map((r) => photo(r.image)))).filter(Boolean);
    el = siteCard(imgs);
  } else {
    const id = u.searchParams.get("r") ?? "";
    if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("bad id", { status: 400 });
    const { data: r } = await db.from("meals_recipes").select("title,source,image").eq("id", id).maybeSingle();
    if (!r) return new Response("not found", { status: 404 });
    el = recipeCard(r, await photo(r.image));
  }
  const img = new ImageResponse(el, { width: W, height: H, fonts: await fonts() });
  const headers = new Headers(img.headers);
  Object.entries(cache).forEach(([k, v]) => headers.set(k, v));
  return new Response(img.body, { status: 200, headers });
});
