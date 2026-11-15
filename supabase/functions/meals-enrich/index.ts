// Enriches recipes with ingredients, cook time, keywords and protein from the page's schema.org Recipe JSON-LD.
// Processes a batch of un-enriched rows per call; call repeatedly until `remaining` is 0.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";
const BATCH = 40;

const decode = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

function findRecipe(node: unknown): Record<string, unknown> | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) { for (const n of node) { const r = findRecipe(n); if (r) return r; } return null; }
  const o = node as Record<string, unknown>;
  const t = o["@type"];
  if (t === "Recipe" || (Array.isArray(t) && t.includes("Recipe"))) return o;
  for (const k of ["@graph", "mainEntity", "itemListElement"]) { const r = findRecipe(o[k]); if (r) return r; }
  return null;
}

// ISO 8601 duration (PT1H30M) -> minutes
const minutes = (d: unknown) => {
  if (typeof d !== "string") return null;
  const m = d.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i);
  if (!m) return null;
  const v = (+(m[1] ?? 0)) * 1440 + (+(m[2] ?? 0)) * 60 + (+(m[3] ?? 0));
  return v > 0 ? v : null;
};
const flat = (v: unknown): string[] =>
  v == null ? [] : Array.isArray(v) ? v.flatMap(flat) : typeof v === "string" ? v.split(/,\s*/) : typeof v === "object" ? [] : [String(v)];

async function enrich(url: string) {
  try {
    const r = await fetch(url, { headers: { "user-agent": UA, accept: "text/html", "accept-language": "en-US,en;q=0.9" } });
    if (!r.ok) return { status: r.status };
    const html = await r.text();
    const blocks = html.match(/<script[^>]*application\/ld\+json[^>]*>[\s\S]*?<\/script>/gi) ?? [];
    let recipe: Record<string, unknown> | null = null;
    for (const b of blocks) {
      try { recipe = findRecipe(JSON.parse(b.replace(/^<script[^>]*>|<\/script>$/gi, ""))); } catch { /* skip bad block */ }
      if (recipe) break;
    }
    // Bon Appétit also exposes keywords in a meta tag.
    const metaKw = html.match(/<meta[^>]+name=["']keywords["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? "";
    if (!recipe) {
      // Microdata (newer Smitten Kitchen / Jetpack recipes).
      const micro = [...html.matchAll(/<(li|p|div|span)\b[^>]*itemprop=["']recipeIngredient["'][^>]*>([\s\S]*?)<\/\1>/gi)].map((m) => decode(m[2])).filter(Boolean);
      const mt = html.match(/itemprop=["']totalTime["'][^>]*(?:content|datetime)=["'](P[^"']+)["']/i)?.[1];
      if (micro.length) return { status: 200, recipe: true, ingredients: micro, total_minutes: minutes(mt), keywords: metaKw ? decode(metaKw).toLowerCase() : null, protein_g: null };
      // Last resort (older Smitten Kitchen posts): the recipe lives at the end of the post body as plain text.
      const body = html.match(/class=["'][^"']*entry-content[^"']*["'][^>]*>([\s\S]*?)(?:<div[^>]+class=["'][^"']*(?:sharedaddy|jp-relatedposts|entry-footer)|<footer)/i)?.[1];
      if (body) {
        const text = decode(body);
        // A how-to or news post has no measurements; an old prose recipe has a few.
        const measures = (text.match(/\b\d[\d\/½¼¾⅓⅔ .-]*\s*(cups?|tablespoons?|tbsp|teaspoons?|tsp|pounds?|lbs?|ounces?|oz|grams?|cloves?|sticks?)\b/gi) ?? []).length;
        if (measures < 2) return { status: 200, recipe: false, keywords: metaKw ? decode(metaKw).toLowerCase() : null };
        const tail = text.slice(Math.floor(text.length * 0.5));
        return { status: 200, recipe: true, ingredients: [tail.slice(0, 6000)], total_minutes: null, keywords: "approx", protein_g: null };
      }
      return { status: 200, recipe: false, keywords: metaKw ? decode(metaKw).toLowerCase() : null };
    }
    const ingredients = flat(recipe.recipeIngredient ?? recipe.ingredients).map(decode).filter(Boolean);
    const total = minutes(recipe.totalTime) ?? ((minutes(recipe.prepTime) ?? 0) + (minutes(recipe.cookTime) ?? 0) || null);
    const kw = [...flat(recipe.keywords), ...flat(recipe.recipeCategory), ...flat(recipe.recipeCuisine), ...flat(recipe.suitableForDiet), metaKw]
      .map((k) => decode(k).toLowerCase().replace(/^https?:\/\/schema\.org\//, "")).filter(Boolean);
    const nutrition = recipe.nutrition as Record<string, unknown> | undefined;
    const protein = nutrition?.proteinContent ? parseInt(String(nutrition.proteinContent)) : NaN;
    return {
      status: 200, recipe: true,
      ingredients: ingredients.length ? ingredients : null,
      total_minutes: total && total < 4320 ? total : null,
      keywords: kw.length ? [...new Set(kw)].join(", ") : null,
      protein_g: Number.isFinite(protein) ? protein : null,
    };
  } catch (e) { return { status: 0, error: String(e) }; }
}

// Half Baked Harvest refuses page fetches from our server, but its public WordPress API says whether a post is
// filed under Recipes (category 4) or one of its sub-categories. null = couldn't tell.
let hbhRecipeCats: Set<number> | null = null;
async function hbhIsRecipe(url: string): Promise<boolean | null> {
  try {
    const api = "https://www.halfbakedharvest.com/wp-json/wp/v2";
    const headers = { "user-agent": UA, accept: "application/json" };
    if (!hbhRecipeCats) {
      const all: { id: number; parent: number }[] = [];
      for (let page = 1; page <= 3; page++) {
        const r = await fetch(`${api}/categories?per_page=100&page=${page}&_fields=id,parent`, { headers });
        if (!r.ok) break;
        const batch = await r.json();
        all.push(...batch);
        if (batch.length < 100) break;
      }
      if (!all.length) return null;
      const parent = new Map(all.map((c) => [c.id, c.parent]));
      const under = (id: number) => { for (let i = 0, c = id; c && i < 10; i++, c = parent.get(c) ?? 0) if (c === 4) return true; return false; };
      hbhRecipeCats = new Set(all.filter((c) => under(c.id)).map((c) => c.id));
    }
    const slug = new URL(url).pathname.split("/").filter(Boolean).pop();
    const r = await fetch(`${api}/posts?slug=${encodeURIComponent(slug ?? "")}&_fields=categories`, { headers });
    if (!r.ok) return null;
    const [post] = await r.json();
    if (!post) return null;
    return (post.categories as number[]).some((c) => hbhRecipeCats!.has(c));
  } catch { return null; }
}

Deno.serve(async (req) => {
  const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, apikey, content-type, x-client-info" };
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: rows } = await db.from("meals_recipes").select("id, url, source").is("enriched_at", null).limit(BATCH);
  const stats: Record<string, { ok: number; noRecipe: number; failed: number; apiRecipe?: number; apiNot?: number }> = {};
  const q = [...(rows ?? [])];
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (q.length) {
      const row = q.shift()!;
      const s = (stats[row.source] ??= { ok: 0, noRecipe: 0, failed: 0 });
      const e = await enrich(row.url);
      if (e.status !== 200) s.failed++; else if (e.recipe) s.ok++; else s.noRecipe++;
      // Recipe or not: from the page when we could read it, else (Half Baked Harvest) from its WordPress categories.
      let isRecipe: boolean | null = e.status === 200 ? !!e.recipe : null;
      if (isRecipe === null && row.source === "Half Baked Harvest") {
        isRecipe = await hbhIsRecipe(row.url);
        if (isRecipe === true) s.apiRecipe = (s.apiRecipe ?? 0) + 1;
        if (isRecipe === false) s.apiNot = (s.apiNot ?? 0) + 1;
      }
      await db.from("meals_recipes").update({
        ingredients: e.ingredients ?? null, total_minutes: e.total_minutes ?? null,
        keywords: e.keywords ?? null, protein_g: e.protein_g ?? null, enriched_at: new Date().toISOString(),
        ...(isRecipe === null ? {} : { is_recipe: isRecipe }),
      }).eq("id", row.id);
    }
  }));
  const { count } = await db.from("meals_recipes").select("id", { count: "exact", head: true }).is("enriched_at", null);
  return new Response(JSON.stringify({ processed: rows?.length ?? 0, remaining: count, stats }), {
    headers: { ...cors, "content-type": "application/json" },
  });
});
