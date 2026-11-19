// Builds forks' crawlable pages from the recipe table. No browser needed.
//   node tools/seo/build.js
// Writes:
//   s/<id>/index.html          one real page per recipe (title, photo, source credit, tags, related recipes)
//   recipes/index.html         the hub listing every collection
//   recipes/<slug>/index.html  collections: courses, diets, sources and useful combinations
//   sitemap.xml                every page above plus the static pages
//   og/index.json              ids that have a share page (the app shares /s/<id>/ for these)
// Run after a harvest (and after tools/og/render.js if you want new share images), then publish.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const ORIGIN = "https://forkslist.com";
const SUPABASE_URL = "https://dmwsylofgfocmbqvmgfe.supabase.co";
const ANON = fs.readFileSync(path.join(ROOT, "tools", "og", "render.js"), "utf8").match(/const ANON = "([^"]+)"/)[1];
const CSS = "/seo.css?v=5";
const SWJS = "/swipe.js?v=1";
const MIN = 6; // a collection needs at least this many recipes to get a page

const JUNK = /(favorite things|weekend reads|gift guide|holiday guide|giveaway|link love|meal plan|^\d+:)/i;
const SMALL = new Set(["a", "an", "and", "or", "the", "with", "of", "in", "on", "for", "to", "de", "y"]);
const smartTitle = (t) => (t === t.toLowerCase()
  ? t.split(" ").map((w, i) => (i && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(" ")
  : t).trim().replace(/\.$/, "");
const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fixImg = (u) => u?.replace(/^http:\/\//, "https://").replace(/^(https:\/\/[^/]+)\/www\.[^/]+\//, "$1/");
const slugify = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const list = (a) => (a.length < 3 ? a.join(" and ") : `${a.slice(0, -1).join(", ")} and ${a[a.length - 1]}`);

// Courses and filters, worded for people searching (not app labels).
const CATS = {
  main: { slug: "dinners", noun: "dinners", title: "Dinner recipes", one: "dinner", app: "main" },
  appetizer: { slug: "appetizers", noun: "appetizers", title: "Appetizer recipes", one: "appetizer", app: "appetizer" },
  dessert: { slug: "desserts", noun: "desserts", title: "Dessert recipes", one: "dessert", app: "dessert" },
  drink: { slug: "drinks", noun: "drinks", title: "Drink recipes", one: "drink", app: "drink" },
};
const TAGS = {
  quick: { slug: "30-minute", adj: "30-minute", label: "Under 30 min", why: "ready in 30 minutes or less, going by each recipe's own cook time" },
  vegetarian: { slug: "vegetarian", adj: "vegetarian", label: "Vegetarian", why: "meatless, going by each recipe's ingredient list" },
  vegan: { slug: "vegan", adj: "vegan", label: "Vegan", why: "free of animal products, going by each recipe's ingredient list" },
  "gluten-free": { slug: "gluten-free", adj: "gluten-free", label: "Gluten-free", why: "made without wheat or gluten ingredients, going by each recipe's ingredient list" },
  "dairy-free": { slug: "dairy-free", adj: "dairy-free", label: "Dairy-free", why: "made without dairy, going by each recipe's ingredient list" },
  protein: { slug: "high-protein", adj: "high-protein", label: "Protein-forward", why: "built around a good amount of protein" },
  kid: { slug: "kid-friendly", adj: "kid-friendly", label: "Kid friendly", why: "familiar, crowd-pleasing dishes kids tend to eat" },
};
const DIET = new Set(["vegetarian", "vegan", "gluten-free", "dairy-free"]);

// ---------- page chrome ----------
const LOGO = `<div class="brand"><a class="logo" href="/" aria-label="forks home">forks<span>.</span></a><p class="tagline">meet your next meal.</p></div>`;
function page({ title, desc, canonical, image = `${ORIGIN}/og/site.jpg`, imageAlt = "forks. meet your next meal.", body, ld = [], extraHead = "" }) {
  const ldTag = ld.length ? `<script type="application/ld+json">${JSON.stringify(ld.length === 1 ? { "@context": "https://schema.org", ...ld[0] } : { "@context": "https://schema.org", "@graph": ld }).replace(/</g, "\\u003c")}</script>\n` : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${canonical}">
<meta name="theme-color" content="#f7f1e8">
<meta property="og:type" content="website">
<meta property="og:site_name" content="forks.">
<meta property="og:title" content="${esc(title.replace(/ \| forks\.$/, ""))}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${image}">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(imageAlt)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title.replace(/ \| forks\.$/, ""))}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${image}">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23e8553e' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2'/%3E%3Cpath d='M7 2v20'/%3E%3Cpath d='M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${CSS}">
${ldTag}${extraHead}<script>
/* Google Analytics: production only, no private URL params or profile codes, no ad features. */
(function () {
  if (!/(^|[.])forkslist[.]com$/.test(location.hostname)) return;
  var id = "G-GY7HMLN3R5", u = new URL(location.href), keep = new URLSearchParams();
  u.searchParams.forEach(function (v, k) { if (/^(cat|want|start|utm_[a-z]+)$/.test(k)) keep.set(k, v); });
  var path = /^[/][A-Za-z]{3}[0-9]{4}[/]?$/.test(u.pathname) ? "/profile" : u.pathname, q = keep.toString();
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { dataLayer.push(arguments); };
  gtag("js", new Date());
  gtag("config", id, { page_location: u.origin + path + (q ? "?" + q : ""), allow_google_signals: false, allow_ad_personalization_signals: false });
  var s = document.createElement("script"); s.async = true; s.src = "https://www.googletagmanager.com/gtag/js?id=" + id; document.head.appendChild(s);
})();
</script>
</head>
<body>
<header class="top">${LOGO}<a class="top-go" href="/">Start swiping</a></header>
<main>
${body}
</main>
<footer class="foot">
  <nav aria-label="More from forks"><a href="/recipes/">All recipe collections</a><a href="/swipe-together/">Decide dinner together</a><a href="/sources.html">Sources</a><a href="/privacy.html">Privacy</a></nav>
  <p>forks links to every recipe on its original site. Photos and recipes belong to their publishers.</p>
  <p class="foot-love">Made with <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg> for Kelly</p>
</footer>
</body>
</html>
`;
}
const crumbs = (items) => `<nav class="crumbs" aria-label="Breadcrumb"><ol>${items.map(([name, href], i) =>
  i === items.length - 1 ? `<li aria-current="page">${esc(name)}</li>` : `<li><a href="${href}">${esc(name)}</a></li>`).join("")}</ol></nav>`;
const crumbLd = (items) => ({ "@type": "BreadcrumbList", itemListElement: items.map(([name, href], i) => ({ "@type": "ListItem", position: i + 1, name, item: ORIGIN + href })) });
const card = (r) => `<li><a class="card" href="/s/${r.id}/">
  <img src="${esc(r.image)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" width="400" height="300">
  <span class="card-t">${esc(r.title)}</span><span class="card-s">${esc(r.source)}${r.total_minutes ? `, ${r.total_minutes} min` : ""}</span>
</a></li>`;

// ---------- data ----------
async function load() {
  const q = "select=id,url,title,description,image,source,category,tags,total_minutes,published_at,created_at&is_recipe=is.true&is_roundup=is.false&image=not.is.null&order=published_at.desc.nullslast";
  const rows = process.env.RECIPES_JSON
    ? JSON.parse(fs.readFileSync(process.env.RECIPES_JSON, "utf8"))
    : await (await fetch(`${SUPABASE_URL}/rest/v1/meals_recipes?${q}`, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } })).json();
  if (!Array.isArray(rows)) throw new Error(`recipes query failed: ${JSON.stringify(rows).slice(0, 200)}`);
  return rows.filter((r) => r.url && !JUNK.test(r.title)).map((r) => ({
    ...r, title: smartTitle(r.title), image: fixImg(r.image), category: r.category || "main",
    tags: (r.tags || []).filter((t) => TAGS[t]), description: ((d) => (d && !/[.!?…"”)]$/.test(d) ? `${d}…` : d))((r.description || "").trim()),
  }));
}

(async () => {
  const recipes = await load();
  const hasOg = (id) => fs.existsSync(path.join(ROOT, "og", `${id}.jpg`));
  const sources = [...new Set(recipes.map((r) => r.source))].sort();
  console.log(`${recipes.length} recipes from ${sources.length} sources`);

  // ---------- collections ----------
  const cols = [];
  const add = (c) => { if (c.items.length >= MIN) cols.push(c); };
  for (const [k, c] of Object.entries(CATS)) {
    const items = recipes.filter((r) => r.category === k);
    add({ slug: c.slug, kind: "course", h1: c.title, title: `${c.title}`, items, app: `/?cat=${c.app}&want=`,
      intro: `${items.length} ${c.noun} from ${list(sources)}, gathered in one place. Tap any recipe to see it, then cook it from the original site.` });
  }
  for (const [k, t] of Object.entries(TAGS)) {
    const items = recipes.filter((r) => r.tags.includes(k));
    add({ slug: t.slug, kind: "filter", h1: `${t.adj[0].toUpperCase()}${t.adj.slice(1)} recipes`, title: `${t.adj[0].toUpperCase()}${t.adj.slice(1)} recipes`, items, tag: k, app: `/?cat=&want=${k}`,
      intro: k === "quick" ? `${items.length} recipes you can make in 30 minutes or less, from ${list(sources)}. Times come from each recipe's own cook time.` : `${items.length} ${t.adj} recipes from ${list(sources)}. Every one is ${t.why}.` });
    for (const [ck, c] of Object.entries(CATS)) {
      if (ck === "drink") continue;
      const sub = items.filter((r) => r.category === ck);
      add({ slug: `${t.slug}-${c.slug}`, kind: "combo", h1: `${t.adj[0].toUpperCase()}${t.adj.slice(1)} ${c.noun}`, title: `${t.adj[0].toUpperCase()}${t.adj.slice(1)} ${c.noun}`, items: sub, tag: k, cat: ck,
        app: `/?cat=${c.app}&want=${k}`, intro: k === "quick" ? `${sub.length} ${c.noun} you can make in 30 minutes or less, from ${list([...new Set(sub.map((r) => r.source))].sort())}. Times come from each recipe's own cook time.` : `${sub.length} ${t.adj} ${c.noun} from ${list([...new Set(sub.map((r) => r.source))].sort())}. Every one is ${t.why}.` });
    }
  }
  for (const s of sources) {
    const items = recipes.filter((r) => r.source === s);
    add({ slug: slugify(s), kind: "source", h1: `${s} recipes`, title: `${s} recipes`, items, source: s, app: "/",
      intro: `${items.length} recipes from ${s}, ready to swipe. Every one links straight to ${s} to cook.` });
    for (const [ck, c] of Object.entries(CATS)) {
      const sub = items.filter((r) => r.category === ck);
      add({ slug: `${slugify(s)}-${c.slug}`, kind: "source-course", h1: `${s} ${c.noun}`, title: `${s} ${c.noun}`, items: sub, source: s, cat: ck, app: `/?cat=${c.app}&want=`,
        intro: `${sub.length} ${c.noun} from ${s}. Tap one to see it, or swipe through them in forks.` });
    }
  }
  const bySlug = Object.fromEntries(cols.map((c) => [c.slug, c]));
  const colsFor = (r) => cols.filter((c) => c.items.includes(r));

  // ---------- recipe pages ----------
  const ids = [];
  for (const r of recipes) {
    const cat = CATS[r.category] || CATS.main;
    const catCol = bySlug[cat.slug];
    const tagNames = r.tags.map((t) => TAGS[t].label);
    const ranked = recipes.filter((x) => x.id !== r.id && x.category === r.category)
      .map((x) => ({ x, s: x.tags.filter((t) => r.tags.includes(t)).length * 3 + (x.source !== r.source ? 1 : 0) + (hash(r.id + x.id) % 100) / 100 }))
      .sort((a, b) => b.s - a.s).map((o) => o.x);
    const related = ranked.slice(0, 6);
    const swDeck = ranked.slice(6, 11).map((x) => ({ id: x.id, url: x.url, title: x.title, description: x.description, image: x.image, source: x.source, category: x.category, tags: x.tags }));
    const more = colsFor(r).filter((c) => c.kind !== "course").slice(0, 8);
    const lead = r.description || `A ${tagNames.length ? `${tagNames.map((t) => t.toLowerCase()).join(", ")} ` : ""}${cat.one} from ${r.source}.`;
    const desc = `${r.description ? `${r.description.replace(/\.?$/, ".")} ` : ""}${r.title} from ${r.source}${r.total_minutes ? `, ready in ${r.total_minutes} minutes` : ""}. See it on forks, then cook it from ${r.source}.`.slice(0, 300);
    const trail = [["Recipes", "/recipes/"], ...(catCol ? [[catCol.h1, `/recipes/${catCol.slug}/`]] : []), [r.title, `/s/${r.id}/`]];
    const body = `${crumbs(trail)}
<article class="recipe">
  <div class="r-photo"><img src="${esc(r.image)}" alt="${esc(r.title)}" referrerpolicy="no-referrer" width="800" height="600" fetchpriority="high"></div>
  <div class="r-body">
    <span class="r-source">${esc(r.source)}</span>
    <h1>${esc(r.title)}</h1>
    <p class="r-lead">${esc(lead)}</p>
    ${r.total_minutes || tagNames.length ? `<ul class="r-facts">${r.total_minutes ? `<li>Ready in ${r.total_minutes} min</li>` : ""}${tagNames.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
    <div class="r-acts">
      <a class="btn" href="${esc(r.url)}" rel="noopener">Get the recipe on ${esc(r.source)}</a>
      <a class="btn btn-ghost" id="swipeMore" href="/?r=${r.id}">Swipe more like this</a>
    </div>
    ${r.tags.some((t) => DIET.has(t)) ? `<p class="r-note">Diet tags come from the recipe's ingredient list. Check the original before cooking for allergies.</p>` : ""}
  </div>
</article>
${swDeck.length >= 2 ? `<section class="sw" id="sw" aria-labelledby="swT" hidden data-sb="${SUPABASE_URL}" data-key="${ANON}" data-more="/?cat=${cat.app}&amp;want=" data-noun="${esc(cat.noun)}">
  <div class="sw-head"><h2 id="swT">Not tonight? Swipe a few<span class="dot">.</span></h2><button class="sw-pill" type="button" hidden></button></div>
  <p class="sw-sub" aria-live="polite"></p>
  <div class="sw-stage"></div>
  <div class="sw-acts"><button class="sw-round sw-btn-nope" type="button" aria-label="Pass"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button><button class="sw-round sw-btn-keep" type="button" aria-label="Keep"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg></button></div>
  <div class="sw-done" hidden><h3 class="sw-done-t"></h3><p class="sw-done-p"></p><div class="sw-done-thumbs"></div>
    <a class="btn" href="/?cat=${cat.app}&amp;want=">Keep swiping ${esc(cat.noun)}</a><button class="sw-text sw-strong sw-see" type="button">See your keeps</button></div>
</section>
<script type="application/json" id="swDeck">${JSON.stringify(swDeck).replace(/</g, "\\u003c")}</script>
<script src="${SWJS}" defer></script>` : ""}
${more.length ? `<section class="chips-sec" aria-labelledby="moreT"><h2 id="moreT">Find more like it</h2><ul class="chips">${more.map((c) => `<li><a href="/recipes/${c.slug}/">${esc(c.h1)}</a></li>`).join("")}</ul></section>` : ""}
${related.length ? `<section aria-labelledby="relT"><h2 id="relT">More ${esc(cat.noun)} you might like</h2><ul class="grid">${related.map(card).join("")}</ul></section>` : ""}
<script>(function(){var b=new URLSearchParams(location.search).get("by");if(b&&/^[a-z0-9_]{2,24}$/i.test(b)){var a=document.getElementById("swipeMore");a.href+="&by="+encodeURIComponent(b);}})();</script>`;
    const dir = path.join(ROOT, "s", r.id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "index.html"), page({
      title: `${r.title} | forks.`, desc, canonical: `${ORIGIN}/s/${r.id}/`,
      image: hasOg(r.id) ? `${ORIGIN}/og/${r.id}.jpg` : `${ORIGIN}/og/site.jpg`, imageAlt: r.title, body,
      ld: [crumbLd(trail), { "@type": "WebPage", name: r.title, url: `${ORIGIN}/s/${r.id}/`, description: desc,
        primaryImageOfPage: r.image, isBasedOn: r.url, about: { "@type": "Thing", name: r.title }, publisher: { "@type": "Organization", name: "forks.", url: ORIGIN } }],
    }));
    ids.push(r.id);
  }
  // Recipes no longer listed keep their old share link working (people may have sent it), but stay out of search.
  const keep = new Set(ids);
  for (const d of fs.readdirSync(path.join(ROOT, "s"))) {
    if (keep.has(d) || !/^[0-9a-f-]{36}$/.test(d)) continue;
    fs.writeFileSync(path.join(ROOT, "s", d, "index.html"), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>forks.</title>
<script>location.replace("/?r=${d}");</script><noscript><meta http-equiv="refresh" content="0;url=/?r=${d}"></noscript>
</head><body style="background:#f7f1e8"></body></html>
`);
  }
  fs.writeFileSync(path.join(ROOT, "og", "index.json"), JSON.stringify(ids));

  // ---------- collection pages ----------
  fs.rmSync(path.join(ROOT, "recipes"), { recursive: true, force: true });
  for (const c of cols) {
    const trail = [["Recipes", "/recipes/"], [c.h1, `/recipes/${c.slug}/`]];
    const siblings = cols.filter((o) => o !== c && ((c.tag && o.tag === c.tag) || (c.cat && o.cat === c.cat) || (c.source && o.source === c.source)
      || (c.kind === "course" && o.cat === Object.keys(CATS).find((k) => CATS[k].slug === c.slug)))).slice(0, 10);
    const shown = c.items.slice(0, 120);
    const body = `${crumbs(trail)}
<section class="col-head col-deck">
  <div class="cd-copy">
    <h1>${esc(c.h1)}<span class="dot">.</span></h1>
    <p>${esc(c.intro)}</p>
    ${c.tag && DIET.has(c.tag) ? `<p class="r-note">Diet labels come from each recipe's ingredient list. Check the original before cooking for allergies.</p>` : ""}
  </div>
  <a class="cd-fan" href="${c.app}" aria-label="Swipe these ${c.items.length} ${esc(c.h1.toLowerCase())} in forks">
    <img class="cd-l" src="${esc(c.items[1].image)}" alt="" referrerpolicy="no-referrer" width="300" height="380">
    <img class="cd-r" src="${esc(c.items[2].image)}" alt="" referrerpolicy="no-referrer" width="300" height="380">
    <span class="cd-top"><img src="${esc(c.items[0].image)}" alt="" referrerpolicy="no-referrer" width="320" height="400"><span class="cd-stamp">KEEP</span><span class="cd-t">${esc(c.items[0].title)}</span></span>
  </a>
  <div class="cd-go"><a class="btn" href="${c.app}">Swipe these ${c.items.length}</a><p>Faster than scrolling. Or browse the list below.</p></div>
</section>
<ul class="grid">${shown.map(card).join("")}</ul>
${siblings.length ? `<section class="chips-sec" aria-labelledby="sibT"><h2 id="sibT">Related collections</h2><ul class="chips">${siblings.map((o) => `<li><a href="/recipes/${o.slug}/">${esc(o.h1)}</a></li>`).join("")}</ul></section>` : ""}`;
    const dir = path.join(ROOT, "recipes", c.slug);
    fs.mkdirSync(dir, { recursive: true });
    const desc = c.intro.slice(0, 300);
    fs.writeFileSync(path.join(dir, "index.html"), page({
      title: `${c.title} (${c.items.length}) | forks.`, desc, canonical: `${ORIGIN}/recipes/${c.slug}/`, body,
      ld: [crumbLd(trail), { "@type": "CollectionPage", name: c.h1, url: `${ORIGIN}/recipes/${c.slug}/`, description: desc,
        mainEntity: { "@type": "ItemList", numberOfItems: shown.length, itemListElement: shown.map((r, i) => ({ "@type": "ListItem", position: i + 1, url: `${ORIGIN}/s/${r.id}/`, name: r.title })) } }],
    }));
  }

  // ---------- hub ----------
  const group = (kinds, h) => {
    const g = cols.filter((c) => kinds.includes(c.kind));
    return g.length ? `<section aria-label="${esc(h)}"><h2>${esc(h)}</h2><ul class="chips">${g.map((c) => `<li><a href="/recipes/${c.slug}/">${esc(c.h1)} <small>${c.items.length}</small></a></li>`).join("")}</ul></section>` : "";
  };
  fs.writeFileSync(path.join(ROOT, "recipes", "index.html"), page({
    title: "Recipe collections | forks.", canonical: `${ORIGIN}/recipes/`,
    desc: `${recipes.length} recipes from ${list(sources)}, sorted into dinners, desserts, quick weeknight meals, vegetarian, vegan, gluten-free and more.`,
    body: `${crumbs([["Recipes", "/recipes/"]])}
<section class="col-head">
  <h1>Find your next meal<span class="dot">.</span></h1>
  <p>${recipes.length} recipes from ${esc(list(sources))}, sorted the way you actually decide what to cook. Or skip the browsing and swipe.</p>
  <a class="btn" href="/">Start swiping</a>
</section>
${group(["course"], "By course")}
${group(["filter"], "By diet and time")}
${group(["combo"], "Weeknight ideas")}
${group(["source", "source-course"], "By source")}`,
    ld: [crumbLd([["Recipes", "/recipes/"]])],
  }));

  // ---------- Swipe with someone explainer (for "how do we decide what to cook" searches and AI answers) ----------
  const faq = [
    ["How does Swipe with someone work?", "One person taps Swipe with someone on forkslist.com and sends the link. Everyone who opens it swipes the same 12 dinners on their own phone. forks then shows the dinners everyone kept."],
    ["Does everyone need an account?", "No. Whoever opens the link can swipe right away. Signing in only matters if you want your keeps saved across devices."],
    ["How many people can swipe in one round?", "Up to 8 people, which covers couples, roommates and most families."],
    ["Where do the recipes come from?", `From ${list(sources)}. Every match links to the original recipe on that site.`],
    ["What happens to the recipes we pick?", "The dinners you swipe right on also land in your own keeps, so you can find them later. A round that sits idle for 2 hours starts fresh next time."],
  ];
  // Real recipes for the drawings: a named dinner if it's still listed, else the newest dinners with photos.
  const dinners = recipes.filter((r) => r.category === "main" && r.image);
  const byTitle = (t) => dinners.find((r) => r.title === t);
  const tgHero = byTitle("Chili Meatballs and Spaghetti") || dinners[0];
  const tgSteps = [byTitle("Grilled Feta with Asparagus Chimichurri"), byTitle("Eggplant Roasted in Satay Sauce"), byTitle("Cornmeal Fried Pork Chops Goat Cheese Smashed Potatoes")]
    .filter(Boolean).concat(dinners.filter((r) => r !== tgHero)).slice(0, 3);
  fs.mkdirSync(path.join(ROOT, "swipe-together"), { recursive: true });
  fs.writeFileSync(path.join(ROOT, "swipe-together", "index.html"), page({
    title: "Decide what to cook together: swipe dinners as a couple or family | forks.", canonical: `${ORIGIN}/swipe-together/`,
    desc: "Can't agree on dinner? Each of you swipes the same 12 recipes on your own phone, and forks shows the ones you all said yes to. No account needed.",
    body: `${crumbs([["Decide dinner together", "/swipe-together/"]])}
<section class="tg-hero">
  <div class="tg-copy">
    <h1>Decide dinner together<span class="dot">.</span></h1>
    <p>Can't agree on what to cook? Start a round of Swipe with someone. You each swipe the same 12 dinners on your own phone, and forks shows you the ones you all said yes to.</p>
    <div class="tg-cta"><a class="btn" href="/?start=together">Start a round</a><span class="tg-fine">Free. No account needed. Up to 8 people.</span></div>
  </div>
  <div class="tg-scene" role="img" aria-label="Two phones swiping the same dinner. Both people keep it, and forks shows the match.">
    <div class="tg-ph tg-ph-a"><span class="tg-who" style="--h:12">A</span><div class="tg-scr"><img src="${esc(tgHero.image)}" alt="" referrerpolicy="no-referrer" width="400" height="560"><span class="tg-stamp">KEEP</span></div></div>
    <div class="tg-ph tg-ph-b"><span class="tg-who" style="--h:150">S</span><div class="tg-scr"><img src="${esc(tgHero.image)}" alt="" referrerpolicy="no-referrer" width="400" height="560"><span class="tg-stamp">KEEP</span></div></div>
    <div class="tg-match"><img src="${esc(tgHero.image)}" alt="" referrerpolicy="no-referrer" width="120" height="120"><div><p class="tg-match-k">You both kept it</p><p class="tg-match-t">${esc(tgHero.title)}</p></div></div>
  </div>
</section>
<section aria-labelledby="howT"><h2 id="howT">How it works</h2>
<ol class="tg-steps">
  <li><div class="tg-sc" aria-hidden="true"><span class="tg-bubble">Dinner? Swipe with me</span><span class="tg-link"><b>forks<i>.</i></b>Swipe with Alex</span></div>
    <div><b>Start a round</b><span>Tap Swipe with someone and send the link by text, or any way you like.</span></div></li>
  <li><div class="tg-sc tg-sc-two" aria-hidden="true"><span class="tg-mini tg-mini-a"><img src="${esc(tgSteps[0].image)}" alt="" referrerpolicy="no-referrer" loading="lazy"><i class="tg-who" style="--h:12">A</i></span><span class="tg-mini tg-mini-b"><img src="${esc(tgSteps[0].image)}" alt="" referrerpolicy="no-referrer" loading="lazy"><i class="tg-who" style="--h:150">S</i></span><span class="tg-count">7 of 12</span></div>
    <div><b>Everyone swipes</b><span>The same 12 dinners for everyone. Right to keep, left to pass. No account needed.</span></div></li>
  <li><div class="tg-sc tg-sc-list" aria-hidden="true">${tgSteps.map((r) => `<span class="tg-row"><img src="${esc(r.image)}" alt="" referrerpolicy="no-referrer" loading="lazy"><i class="tg-bar"></i><i class="tg-dot" style="--h:12"></i><i class="tg-dot" style="--h:150"></i></span>`).join("")}<span class="tg-count tg-ok">${tgSteps.length} matches</span></div>
    <div><b>See your matches</b><span>forks shows the dinners everyone kept. Pick one and cook it from the original recipe.</span></div></li>
</ol></section>
<section aria-labelledby="faqT"><h2 id="faqT">Questions</h2>
<dl class="faq">${faq.map(([q, a]) => `<dt>${esc(q)}</dt><dd>${esc(a)}</dd>`).join("")}</dl></section>
<section class="chips-sec" aria-labelledby="ideasT"><h2 id="ideasT">Short on ideas?</h2><ul class="chips">${["30-minute-dinners", "vegetarian-dinners", "kid-friendly-dinners", "high-protein-dinners", "dinners"].filter((k) => bySlug[k]).map((k) => `<li><a href="/recipes/${k}/">${esc(bySlug[k].h1)}</a></li>`).join("")}</ul></section>`,
    ld: [crumbLd([["Decide dinner together", "/swipe-together/"]]), { "@type": "FAQPage", mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) }],
  }));

  // ---------- sitemap ----------
  const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);
  const today = new Date().toISOString().slice(0, 10);
  const urls = [
    [`${ORIGIN}/`, today, "daily", "1.0"],
    [`${ORIGIN}/swipe-together/`, null, "monthly", "0.8"],
    [`${ORIGIN}/recipes/`, today, "weekly", "0.8"],
    ...cols.map((c) => [`${ORIGIN}/recipes/${c.slug}/`, today, "weekly", "0.7"]),
    ...recipes.map((r) => [`${ORIGIN}/s/${r.id}/`, day(r.published_at || r.created_at), "monthly", "0.6"]),
    [`${ORIGIN}/sources.html`, null, "monthly", "0.4"],
  ];
  fs.writeFileSync(path.join(ROOT, "sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(([u, m, f, p]) => `  <url><loc>${u}</loc>${m ? `<lastmod>${m}</lastmod>` : ""}<changefreq>${f}</changefreq><priority>${p}</priority></url>`).join("\n")}
</urlset>
`);
  console.log(`${ids.length} recipe pages, ${cols.length} collections, ${urls.length} sitemap urls`);
})();
