// Renders Open Graph share images (1200x630 JPEG) with headless Chromium.
//   node tools/og/render.js            -> og/site.jpg + og/<recipe-id>.jpg for every recipe missing one
//   node tools/og/render.js --all      -> re-render everything
//   node tools/og/render.js --site     -> only og/site.jpg
// Output goes to ./og, which is published with the site at https://forkslist.com/og/...
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const SUPABASE_URL = "https://dmwsylofgfocmbqvmgfe.supabase.co";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtd3N5bG9mZ2ZvY21icXZtZ2ZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwMDg1NTMsImV4cCI6MjEwMDU4NDU1M30.Jxsz_HK6jE4y2T36RJMtRWpaXlk0ugyEL2b7CXTrgE8";
const OUT = path.join(__dirname, "..", "..", "og");
const ALL = process.argv.includes("--all");
const JUNK = /(favorite things|weekend reads|gift guide|holiday guide|giveaway|link love|^\d+:)/i;
const SMALL = new Set(["a", "an", "and", "or", "the", "with", "of", "in", "on", "for", "to", "de", "y"]);
const smartTitle = (t) => (t === t.toLowerCase()
  ? t.split(" ").map((w, i) => (i && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(" ")
  : t).trim().replace(/\.$/, "");
const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fixImg = (u) => u?.replace(/^http:\/\//, "https://").replace(/^(https:\/\/[^/]+)\/www\.[^/]+\//, "$1/");

const BASE = `
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Inter:wght@600&display=block" rel="stylesheet">
<style>
  * { margin: 0; box-sizing: border-box; }
  html, body { width: 1200px; height: 630px; overflow: hidden; }
  body { font-family: Inter, sans-serif; background: #f7f1e8; color: #2a211c; position: relative; }
  .mark { font-family: Fraunces, serif; font-weight: 700; letter-spacing: -0.02em; }
  .mark i { font-style: normal; color: #e8553e; }
</style>`;

const recipeHTML = (r) => `<!doctype html><html><head>${BASE}<style>
  .photo { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .shade { position: absolute; inset: 0; background: linear-gradient(to top, rgba(20,14,10,.9) 0%, rgba(20,14,10,.45) 42%, rgba(20,14,10,0) 70%), linear-gradient(to bottom, rgba(20,14,10,.42) 0%, rgba(20,14,10,0) 26%); }
  .pill { position: absolute; top: 40px; left: 48px; background: #f7f1e8; border-radius: 999px; padding: 8px 24px 12px; font-size: 40px; line-height: 1; box-shadow: 0 8px 24px rgba(0,0,0,.18); }
  .body { position: absolute; left: 56px; right: 56px; bottom: 50px; color: #fff; }
  .src { display: inline-block; font-size: 19px; letter-spacing: .14em; text-transform: uppercase; padding: 8px 16px; border-radius: 999px; background: rgba(255,255,255,.2); backdrop-filter: blur(8px); margin-bottom: 18px; }
  h1 { font-family: Fraunces, serif; font-weight: 700; font-size: 70px; line-height: 1.04; letter-spacing: -0.01em; text-wrap: balance; text-shadow: 0 2px 20px rgba(0,0,0,.25); }
  .tag { position: absolute; top: 52px; right: 56px; font-family: Fraunces, serif; font-style: italic; font-size: 26px; color: #fff; text-shadow: 0 2px 12px rgba(0,0,0,.45); }
  body.nophoto .body { color: #2a211c; }
  body.nophoto .src { background: #e8553e; color: #fff; }
  body.nophoto .tag { color: #8a7d72; text-shadow: none; }
  body.nophoto h1 { text-shadow: none; }
</style></head><body>
  <img class="photo" src="${esc(r.image)}" referrerpolicy="no-referrer" onerror="document.body.classList.add('nophoto'); this.remove(); document.querySelector('.shade').remove();">
  <div class="shade"></div>
  <div class="pill mark">forks<i>.</i></div>
  <div class="tag">meet your next meal.</div>
  <div class="body"><span class="src">${esc(r.source)}</span><h1>${esc(r.title)}</h1></div>
</body></html>`;

// Site image: wordmark + tagline on the left; on the right, the app's swipe moment:
// a fanned stack of three meal cards with the top one tilting right under the green KEEP mask.
const siteHTML = (imgs) => `<!doctype html><html><head>${BASE}<style>
  .left { position: absolute; left: 84px; top: 0; bottom: 0; width: 470px; display: flex; flex-direction: column; justify-content: center; z-index: 5; }
  .big { font-size: 132px; line-height: .9; }
  .tl { font-family: Fraunces, serif; font-style: italic; font-weight: 600; font-size: 44px; margin-top: 18px; }
  .card { position: absolute; border-radius: 26px; overflow: hidden; background: #e9dfd2; box-shadow: 0 26px 50px rgba(42,33,28,.30); }
  .card img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .keep { position: absolute; inset: 0; background: rgba(108,214,150,.72); display: grid; place-items: center; }
  .keep span { font-family: Fraunces, serif; font-weight: 700; color: #fff; font-size: 72px; border: 7px solid #fff; border-radius: 18px; padding: 2px 22px; transform: rotate(-10deg); }
</style></head><body>
  <div class="left"><div class="mark big">forks<i>.</i></div><div class="tl">meet your next meal.</div></div>
  <div class="card" style="left:572px; top:104px; width:330px; height:440px; transform:rotate(-9deg) scale(.92)"><img src="${esc(imgs[2])}" referrerpolicy="no-referrer"></div>
  <div class="card" style="left:628px; top:88px; width:340px; height:455px; transform:rotate(-2deg) scale(.96)"><img src="${esc(imgs[1])}" referrerpolicy="no-referrer"></div>
  <div class="card" style="left:690px; top:70px; width:350px; height:470px; transform:rotate(8deg); z-index:3">
    <img src="${esc(imgs[0])}" referrerpolicy="no-referrer"><div class="keep"><span>KEEP</span></div>
  </div>
</body></html>`;

async function shoot(page, html, file) {
  await page.setContent(html, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
  await page.screenshot({ path: file, type: "jpeg", quality: 84 });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  // RECIPES_JSON lets you pass a pre-downloaded list (e.g. when Node can't reach the network directly).
  const raw = process.env.RECIPES_JSON
    ? JSON.parse(fs.readFileSync(process.env.RECIPES_JSON, "utf8"))
    : await (await fetch(`${SUPABASE_URL}/rest/v1/meals_recipes?select=id,title,source,image,category&image=not.is.null&is_roundup=is.false`, { headers: { apikey: ANON, Authorization: `Bearer ${ANON}` } })).json();
  const recipes = raw.filter((r) => !JUNK.test(r.title)).map((r) => ({ ...r, title: smartTitle(r.title), image: fixImg(r.image) }));
  const todo = recipes.filter((r) => ALL || !fs.existsSync(path.join(OUT, `${r.id}.jpg`)));
  console.log(`${recipes.length} recipes, ${todo.length} to render`);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });

  // Site image: three mains (not desserts or drinks), preferring hearty dinners, from hosts that load reliably.
  const sitePage = await ctx.newPage();
  const mains = recipes.filter((r) => r.category === "main" && /assets\.bonappetit|smittenkitchen|i0\.wp\.com/.test(r.image));
  const hearty = /steak|chicken|pasta|lasagna|salmon|shrimp|pork|tacos|curry|stew|chili|roast|meatballs|noodles|risotto|potatoes/i;
  const picks = [...mains.filter((r) => hearty.test(r.title)), ...mains].map((r) => r.image)
    .filter((v, i, a) => a.indexOf(v) === i).slice(0, 3);
  await shoot(sitePage, siteHTML(picks), path.join(OUT, "site.jpg"));
  console.log("site.jpg");
  if (process.argv.includes("--site")) { await browser.close(); return; }

  let done = 0, noPhoto = 0;
  const queue = [...todo];
  await Promise.all(Array.from({ length: 4 }, async () => {
    const page = await ctx.newPage();
    while (queue.length) {
      const r = queue.shift();
      await shoot(page, recipeHTML(r), path.join(OUT, `${r.id}.jpg`));
      if (await page.evaluate(() => document.body.classList.contains("nophoto"))) noPhoto++;
      if (++done % 50 === 0) console.log(`${done}/${todo.length}`);
    }
  }));
  console.log(`done: ${done} rendered, ${noPhoto} without a photo`);
  await browser.close();

  // Share pages (s/<id>/), collections, the sitemap and og/index.json are built by tools/seo/build.js. Run it next.
  console.log("now run: node tools/seo/build.js");
})();
