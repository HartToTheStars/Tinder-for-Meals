import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
import { icon } from "/icons.js?v=32";

const SUPABASE_URL = "https://dmwsylofgfocmbqvmgfe.supabase.co";
// Public anon key (safe to ship; access is governed by RLS).
const SUPABASE_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtd3N5bG9mZ2ZvY21icXZtZ2ZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwMDg1NTMsImV4cCI6MjEwMDU4NDU1M30.Jxsz_HK6jE4y2T36RJMtRWpaXlk0ugyEL2b7CXTrgE8";
// Once signed in, stay signed in: the session lives in localStorage and refreshes itself until sign-out.
const db = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: "forks-auth" },
});

const $ = (s) => document.querySelector(s);
const deckEl = $("#deck");
const deckMsg = $("#deckMsg");
const state = {
  deck: [], kept: [], history: [], query: "", source: "All", busy: false, dry: false, sinceRefine: 0,
  cat: "", keptCat: "", round: [], want: new Set(), keptWant: new Set(), user: null, ctaShown: false,
  follows: new Set(), featured: [], people: [], me: null,
};
const BREAK_EVERY = 20;
const REFINE_EVERY = 10;
const CTA_AFTER = 3;
const CATS = { "": ["utensils", "All", "recipes"], main: ["cooking-pot", "Mains", "mains"], appetizer: ["salad", "Apps", "apps"], dessert: ["cake-slice", "Desserts", "desserts"], drink: ["martini", "Drinks", "drinks"] };
const TAGS = [
  ["kid", "baby", "Kid friendly"], ["quick", "timer", "Under 30 min"], ["protein", "drumstick", "Protein-forward"],
  ["vegetarian", "carrot", "Vegetarian"], ["vegan", "sprout", "Vegan"], ["gluten-free", "wheat-off", "Gluten-free"], ["dairy-free", "milk-off", "Dairy-free"],
];
const TAG = Object.fromEntries(TAGS.map(([k, i, l]) => [k, { i, l }]));
const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// ---------- helpers ----------
const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const ls = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};
let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}
function hearts(x, y) {
  const colors = ["#e8553e", "#3f9b6b", "#e9a23b", "#e8553e"];
  for (let i = 0; i < 9; i++) {
    const h = document.createElement("span");
    h.className = "heart";
    h.innerHTML = icon("heart");
    h.style.color = colors[i % colors.length];
    h.style.left = x + (Math.random() * 60 - 30) + "px";
    h.style.top = y + (Math.random() * 30 - 15) + "px";
    h.style.setProperty("--dx", Math.random() * 140 - 70 + "px");
    h.style.setProperty("--rot", Math.random() * 80 - 40 + "deg");
    h.style.animationDelay = i * 35 + "ms";
    document.body.appendChild(h);
    setTimeout(() => h.remove(), 1400);
  }
}
const JUNK = /(favorite things|weekend reads|gift guide|holiday guide|giveaway|link love|^\d+:)/i;
const SMALL = new Set(["a", "an", "and", "or", "the", "with", "of", "in", "on", "for", "to", "de", "y"]);
const smartTitle = (t) => t === t.toLowerCase()
  ? t.split(" ").map((w, i) => (i && SMALL.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(" ")
  : t;
const clean = (r) => ({
  ...r,
  title: smartTitle(r.title.trim().replace(/\.$/, "")),
  image: r.image?.replace(/^http:\/\//, "https://").replace(/^(https:\/\/[^/]+)\/www\.[^/]+\//, "$1/"),
});
// Just what the UI needs, for storing guest keeps on the device.
const slim = (r) => ({ id: r.id, url: r.url, title: r.title, description: r.description, image: r.image, source: r.source, category: r.category, tags: r.tags });
const preload = (src) => { const i = new Image(); i.referrerPolicy = "no-referrer"; i.src = src; };
const tagIcons = (r, max = 3) => (r.tags || []).filter((t) => TAG[t])
  .sort((a, b) => TAGS.findIndex((x) => x[0] === a) - TAGS.findIndex((x) => x[0] === b)).slice(0, max);

// ---------- storage: guests keep swipes on the device, signed-in users in Supabase ----------
const GUEST = "forks:guest";
let guest = ls.get(GUEST, null) || { swipes: {}, kept: [] }; // swipes: { recipeId: liked }
const saveGuest = () => ls.set(GUEST, guest);
const guestIds = () => {
  if (state.user) return { p_liked: [], p_noped: [] };
  const e = Object.entries(guest.swipes);
  return { p_liked: e.filter(([, l]) => l).map(([id]) => id), p_noped: e.filter(([, l]) => !l).map(([id]) => id) };
};

const store = {
  async swipe(recipe, liked) {
    if (state.user) {
      const { error } = await db.from("meals_user_swipes").upsert(
        { user_id: state.user.id, recipe_id: recipe.id, liked, swiped_at: new Date().toISOString() },
        { onConflict: "user_id,recipe_id" });
      return error;
    }
    guest.swipes[recipe.id] = liked;
    if (liked) guest.kept = [slim(recipe), ...guest.kept.filter((r) => r.id !== recipe.id)];
    saveGuest();
    return null;
  },
  async unswipe(id) {
    if (state.user) return (await db.from("meals_user_swipes").delete().eq("recipe_id", id)).error;
    delete guest.swipes[id];
    guest.kept = guest.kept.filter((r) => r.id !== id);
    saveGuest();
    return null;
  },
  async unkeep(id) {
    if (state.user) return (await db.from("meals_user_swipes").update({ liked: false }).eq("recipe_id", id)).error;
    guest.swipes[id] = false;
    guest.kept = guest.kept.filter((r) => r.id !== id);
    saveGuest();
    return null;
  },
  async kept() {
    if (!state.user) return guest.kept.map(clean);
    const { data, error } = await db.from("meals_user_swipes")
      .select("swiped_at, recipe:meals_recipes(*)").eq("liked", true).order("swiped_at", { ascending: false });
    if (error) { console.error(error); return state.kept; }
    return data.filter((d) => d.recipe).map((d) => clean({ ...d.recipe, swiped_at: d.swiped_at }));
  },
};

// After signing in: copy anything swiped as a guest into the account (existing opinions win), then forget it locally.
async function mergeGuest() {
  const entries = Object.entries(guest.swipes);
  if (!state.user || !entries.length) return 0;
  const rows = entries.map(([recipe_id, liked]) => ({ user_id: state.user.id, recipe_id, liked }));
  const { error } = await db.from("meals_user_swipes").upsert(rows, { onConflict: "user_id,recipe_id", ignoreDuplicates: true });
  if (error) { console.error(error); return 0; }
  guest = { swipes: {}, kept: [] };
  ls.del(GUEST);
  return rows.filter((r) => r.liked).length;
}

// ---------- filter UI ----------
function renderCats(el, active, withCounts) {
  el.innerHTML = Object.entries(CATS).map(([k, [ic, label]]) =>
    `<button class="cat ${k === active ? "is-active" : ""}" data-cat="${k}" role="radio" aria-checked="${k === active}">${icon(ic, "cat-ic")}${label}${withCounts ? `<b class="cat-n"></b>` : ""}</button>`).join("");
}
function markCat(el, active) {
  el.querySelectorAll(".cat").forEach((b) => {
    const on = b.dataset.cat === active;
    b.classList.toggle("is-active", on);
    b.setAttribute("aria-checked", on);
  });
}
// `only`: show just these tags (plus any selected ones). Null shows all.
function renderTagRow(el, selected, onToggle, only = el._only ?? null) {
  el._only = only;
  const tick = `<span class="tick">${icon("check")}</span>`;
  const shown = TAGS.filter(([k]) => !only || only.has(k) || selected.has(k));
  el.hidden = !shown.length;
  el.innerHTML = shown.map(([k, ic, l]) =>
    `<button class="tag ${selected.has(k) ? "is-on" : ""}${k === el._just ? " just" : ""}" data-tag="${k}" aria-pressed="${selected.has(k)}">${tick}${icon(ic, "ti")}${l}</button>`).join("") +
    (selected.size ? `<button class="tag clear" data-tag="__clear">Clear</button>` : "");
  el.onclick = (e) => {
    const b = e.target.closest(".tag");
    if (!b) return;
    // Only the filter just tapped gets the hop, not every one already on.
    el._just = b.dataset.tag;
    clearTimeout(el._justT);
    el._justT = setTimeout(() => { el._just = null; }, 600);
    if (b.dataset.tag === "__clear") selected.clear();
    else selected.has(b.dataset.tag) ? selected.delete(b.dataset.tag) : selected.add(b.dataset.tag);
    renderTagRow(el, selected, onToggle);
    onToggle();
  };
}
const loadSet = (k) => new Set((ls.get(k, []) || []).filter((t) => TAG[t]));
const saveSet = (k, set) => ls.set(k, [...set]);

// ---------- deck ----------
async function fetchDeck() {
  const exclude = new Set([...state.deck.map((r) => r.id), ...state.history.map((h) => h.recipe.id)]);
  const { data, error } = await db.rpc("meals_deck", { n: 20, cat: state.cat || null, want: [...state.want], ...guestIds() });
  if (error) { console.error(error); return []; }
  const recipes = data.filter((r) => !exclude.has(r.id) && !JUNK.test(r.title)).map(clean);
  await attachKeptBy(recipes);
  return recipes;
}

// "Kelly kept this" / "Kept by 12 people" on cards.
async function attachKeptBy(recipes) {
  if (!recipes.length) return;
  const { data } = await db.rpc("meals_kept_by", { p_ids: recipes.map((r) => r.id), p_follows: state.user ? [] : [...state.follows] });
  const by = new Map((data || []).map((d) => [d.recipe_id, d]));
  recipes.forEach((r) => { const d = by.get(r.id); if (d) r.keptBy = { total: Number(d.total), people: d.people || [] }; });
}
const BRAND = ["#e8553e", "#3f9b6b", "#d9962f", "#9b5a7a", "#7d8b3a", "#c8693f"];
const colorFor = (name) => BRAND[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % BRAND.length];
const avatar = (name, cls = "", color = null) =>
  `<span class="avatar ${cls}" style="background:${esc(color || colorFor(name))}">${esc(name.charAt(0).toUpperCase())}</span>`;
function keptByHTML(r) {
  const k = r.keptBy;
  if (!k) return "";
  if (k.people.length) {
    const p = k.people[0];
    const more = k.people.length > 1 ? ` + ${k.people.length - 1}` : "";
    return `<button class="kept-by" data-handle="${esc(p.handle)}">${avatar(p.name, "xs", p.color)}${esc(p.name)}${more} kept this</button>`;
  }
  return k.total >= 3 ? `<span class="kept-by quiet">${icon("users")}Kept by ${k.total} people</span>` : "";
}

async function refill() {
  if (state.busy) return;
  state.busy = true;
  const key = () => state.cat + "|" + [...state.want].sort() + "|" + (state.user?.id ?? "guest");
  const k = key();
  const more = await fetchDeck();
  if (k !== key()) { state.busy = false; return refill(); } // filters or account changed mid-flight
  state.dry = more.length === 0;
  state.deck.unshift(...more); // new cards go underneath
  more.slice(-4).forEach((r) => preload(r.image));
  state.busy = false;
  render();
}

function cardHTML(r) {
  const t = tagIcons(r);
  return `
    <img src="${esc(r.image)}" alt="" referrerpolicy="no-referrer" draggable="false" />
    <div class="stamp stamp-like"><span>KEEP</span></div>
    <div class="stamp stamp-nope"><span>NOPE</span></div>
    ${keptByHTML(r)}
    <div class="card-body">
      <span class="source">${esc(r.source)}</span>${t.length ? `<span class="card-tags">${t.map((k) => `<span title="${TAG[k].l}">${icon(TAG[k].i)}</span>`).join("")}</span>` : ""}
      <h2>${esc(r.title)}</h2>
      ${r.description ? `<p>${esc(r.description)}</p>` : ""}
    </div>`;
}

function render() {
  const visible = state.deck.slice(-4);
  const existing = new Map([...deckEl.querySelectorAll(".card:not(.toss)")].map((el) => [el.dataset.id, el]));
  const keep = new Set(visible.map((r) => r.id));
  existing.forEach((el, id) => { if (!keep.has(id) && !el.classList.contains("gone")) el.remove(); });

  // DOM order mirrors deck order: last child is the top card.
  visible.forEach((r) => {
    let el = existing.get(r.id);
    if (!el || el.classList.contains("gone")) {
      el = document.createElement("article");
      el.className = dealt ? "card deal" : "card";
      el.dataset.id = r.id;
      el.innerHTML = cardHTML(r);
      const img = el.querySelector("img");
      img.onerror = () => img.remove();
    }
    if (deckEl.lastElementChild !== el) deckEl.appendChild(el);
  });
  // Cards flying away sit first in the DOM (so stack math ignores them) but render on top.
  deckEl.querySelectorAll(".card.gone").forEach((g) => deckEl.insertBefore(g, deckEl.firstChild));

  const top = topCard();
  if (top) { bindDrag(top); maybeTeach(top); }
  const cur = state.deck[state.deck.length - 1];
  $("#btnOpen").href = cur ? cur.url : "#";
  // Desktop: the stage glows with a blur of the top card's photo.
  const amb = $("#ambient");
  if (cur?.image && amb.dataset.src !== cur.image) {
    amb.dataset.src = cur.image;
    amb.style.backgroundImage = `url("${cur.image.replace(/"/g, "%22")}")`;
  }
  $("#btnUndo").disabled = state.history.length === 0;

  if (!state.deck.length) {
    const want = [...state.want];
    deckMsg.innerHTML = state.busy
      ? `<div class="spinner"></div><p>Setting the table…</p>`
      : want.length
        ? `<div class="big">${want.map((t) => icon(TAG[t].i)).join("")}</div><h3>Nothing left that fits</h3><p>You've swiped every ${want.map((t) => TAG[t].l.toLowerCase()).join(" + ")} ${CATS[state.cat][2]} we have.</p><div class="row"><button class="btn" id="btnClearTags">Clear filters</button><button class="btn btn-ghost" id="btnHarvest">Find fresh recipes</button></div>`
      : state.cat
        ? `<div class="big">${icon(CATS[state.cat][0])}</div><h3>That's every one of the ${CATS[state.cat][2]}</h3><p>Swipe through everything else, or check the kitchens for more.</p><div class="row"><button class="btn" id="btnAll">Show everything</button><button class="btn btn-ghost" id="btnHarvest">Find fresh recipes</button></div>`
        : `<div class="big">${icon("chef-hat")}</div><h3>You've seen it all</h3><p>Want me to check the kitchens for new recipes?</p><button class="btn" id="btnHarvest">Find fresh recipes</button>`;
    deckMsg.hidden = false;
    $("#btnHarvest")?.addEventListener("click", harvest);
    $("#btnAll")?.addEventListener("click", () => setCat(""));
    $("#btnClearTags")?.addEventListener("click", () => { state.want.clear(); onWantChange(); });
  } else deckMsg.hidden = true;

  if (state.deck.length < 5 && !state.dry && !state.busy) refill();
}

const topCard = () => [...deckEl.querySelectorAll(".card:not(.gone):not(.toss)")].pop();

// Course filter: toss the current cards, deal a fresh hand.
let dealt = false;
function setCat(cat) {
  if (cat === state.cat) return;
  state.cat = cat;
  markCat($("#cats"), cat);
  ls.set("forks:cat", cat);
  reshuffle();
}
function reshuffle() {
  deckEl.querySelectorAll(".card").forEach((c) => { c._stopTeach?.(); c.classList.add("toss"); setTimeout(() => c.remove(), 220); });
  state.deck = [];
  state.dry = false;
  dealt = true;
  deckMsg.hidden = true;
  clearTimeout(reshuffle.t);
  reshuffle.t = setTimeout(refill, 150);
}
function onWantChange() {
  saveSet("forks:want", state.want);
  renderTagRow($("#tags"), state.want, onWantChange);
  reshuffle();
}
$("#cats").addEventListener("click", (e) => { const b = e.target.closest(".cat"); if (b) setCat(b.dataset.cat); });

// One-time intro: lean right (KEEP), then left (NOPE), then settle.
let taught = false;
function maybeTeach(el) {
  if (taught || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  taught = true;
  const like = el.querySelector(".stamp-like"), nope = el.querySelector(".stamp-nope");
  const lean = (x, r) => `translate(${x}px, 0) rotate(${r}deg)`;
  const card = el.animate([
    { transform: lean(0, 0), offset: 0 },
    { transform: lean(36, 3), offset: 0.22 },
    { transform: lean(36, 3), offset: 0.38 },
    { transform: lean(-36, -3), offset: 0.62 },
    { transform: lean(-36, -3), offset: 0.78 },
    { transform: lean(0, 0), offset: 1 },
  ], { duration: 1800, delay: 500, easing: "cubic-bezier(.45,0,.25,1)", fill: "forwards" });
  const fade = (stamp, a, b, c, d) => stamp.animate([
    { opacity: 0, offset: 0 }, { opacity: 0, offset: a }, { opacity: 0.9, offset: b },
    { opacity: 0.9, offset: c }, { opacity: 0, offset: d }, { opacity: 0, offset: 1 },
  ], { duration: 1800, delay: 500, fill: "forwards" });
  const anims = [card, fade(like, 0.05, 0.22, 0.38, 0.5), fade(nope, 0.5, 0.62, 0.78, 0.92)];
  const stop = () => anims.forEach((a) => a.cancel());
  card.finished.then(stop).catch(() => {});
  el.addEventListener("pointerdown", stop, { once: true });
  document.addEventListener("keydown", stop, { once: true });
  el._stopTeach = stop;
}

function bindDrag(el) {
  if (el._bound) return;
  el._bound = true;
  let sx = 0, sy = 0, dx = 0, dy = 0, down = false, downOn = null;
  const like = el.querySelector(".stamp-like"), nope = el.querySelector(".stamp-nope");
  el.addEventListener("pointerdown", (e) => {
    if (el !== topCard()) return;
    down = true; sx = e.clientX; sy = e.clientY; dx = dy = 0; downOn = e.target;
    el.setPointerCapture(e.pointerId);
    el.classList.add("dragging");
  });
  el.addEventListener("pointermove", (e) => {
    if (!down) return;
    dx = e.clientX - sx; dy = e.clientY - sy;
    el.style.transform = `translate(${dx}px, ${dy * 0.4}px) rotate(${dx / 14}deg)`;
    like.style.opacity = Math.max(0, Math.min(1, dx / 90));
    nope.style.opacity = Math.max(0, Math.min(1, -dx / 90));
  });
  const end = (e) => {
    if (!down) return;
    down = false;
    el.classList.remove("dragging");
    const threshold = Math.min(110, el.offsetWidth * 0.28);
    if (dx > threshold) swipe(true, e);
    else if (dx < -threshold) swipe(false, e);
    else {
      el.style.transform = ""; like.style.opacity = nope.style.opacity = 0;
      // A tap (not a drag) on "Kelly kept this" opens her list.
      const pill = Math.abs(dx) < 6 && Math.abs(dy) < 6 && downOn?.closest?.(".kept-by[data-handle]");
      if (pill) openPeople(pill.dataset.handle);
    }
  };
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
}

const sheetOpen = () => ["#break", "#save", "#acct", "#people", "#landing", "#nameSheet"].some((s) => !$(s).hidden);

async function swipe(liked, evt) {
  const el = topCard();
  const recipe = state.deck[state.deck.length - 1];
  if (!el || !recipe || sheetOpen()) return;

  el._stopTeach?.();
  el.classList.add("gone");
  el.querySelector(liked ? ".stamp-like" : ".stamp-nope").style.opacity = 1;
  const w = window.innerWidth;
  el.style.transform = `translate(${liked ? w : -w}px, ${-40}px) rotate(${liked ? 28 : -28}deg)`;
  el.style.opacity = "0";
  setTimeout(() => el.remove(), 380);

  state.deck.pop();
  state.history.push({ recipe, liked });
  state.round.push({ recipe, liked });
  const btn = liked ? $("#btnLike") : $("#btnNope");
  btn.classList.remove("pulse"); void btn.offsetWidth; btn.classList.add("pulse");

  if (liked) {
    const rect = btn.getBoundingClientRect();
    hearts(evt?.clientX ?? rect.left + rect.width / 2, evt?.clientY ?? rect.top);
    state.kept.unshift({ ...recipe, swiped_at: new Date().toISOString() });
    state.freshId = recipe.id; // flashes in the desktop sidebar
    updateCount(true);
    renderKept();
  }
  render();

  const error = await store.swipe(recipe, liked);
  if (error) { console.error(error); toast("Couldn't save that swipe"); return; }
  updateAcct();

  // Nudges: save-your-keeps for guests first, otherwise the 20-swipe check-in.
  if (shouldOfferSave()) { state.ctaShown = true; setTimeout(() => openSave("cta"), 450); }
  else if (state.round.length >= BREAK_EVERY) setTimeout(checkIn, 450);

  if (++state.sinceRefine >= REFINE_EVERY) { state.sinceRefine = 0; refineTaste(true); }
}

// Re-rank whatever is queued behind the visible cards, using everything swiped so far.
async function refineTaste(announce) {
  const { data, error } = await db.rpc("meals_taste_top", guestIds());
  if (error) console.error(error);
  state.deck = state.deck.slice(-3);
  state.dry = false;
  await refill();
  const top = (data?.top ?? []).map((t) => t.replace(/^src:/, ""));
  if (announce) toast(top.length ? `Tuned to you: more ${top.join(", ")}` : "Learning your taste…");
}

async function undo() {
  if (sheetOpen()) return;
  const last = state.history.pop();
  if (!last) return;
  if (state.round.at(-1)?.recipe.id === last.recipe.id) state.round.pop();
  state.deck.push(last.recipe);
  if (last.liked) {
    state.kept = state.kept.filter((r) => r.id !== last.recipe.id);
    updateCount();
    renderKept();
  }
  render();
  await store.unswipe(last.recipe.id);
  updateAcct();
}

async function harvest() {
  deckMsg.innerHTML = `<div class="spinner"></div><p>Raiding the pantries…</p>`;
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/meals-harvest`, {
      method: "POST", headers: { Authorization: `Bearer ${SUPABASE_ANON}`, apikey: SUPABASE_ANON },
    });
    const json = await res.json();
    toast(json.added ? `${json.added} fresh recipes` : "Nothing new yet. Check back tomorrow.");
    // Tag the new arrivals (ingredients, cook time) so diet filters work on them.
    if (json.added) for (let i = 0; i < 2; i++) await fetch(`${SUPABASE_URL}/functions/v1/meals-enrich`, {
      method: "POST", headers: { Authorization: `Bearer ${SUPABASE_ANON}`, apikey: SUPABASE_ANON },
    }).catch(() => {});
  } catch { toast("The kitchens didn't answer"); }
  state.dry = false;
  await refill();
}

// ---------- kept ----------
async function loadKept() {
  state.kept = await store.kept();
  updateCount();
  renderKept();
}

function updateCount(bump) {
  for (const c of [$("#keptCount"), $("#keptCount2")]) {
    c.textContent = state.kept.length;
    c.hidden = !state.kept.length; // no "0" badges
    if (bump) { c.classList.remove("bump"); void c.offsetWidth; c.classList.add("bump"); }
  }
}

const norm = (s = "") => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
function highlight(text, terms) {
  let out = esc(text);
  terms.forEach((t) => {
    if (!t) return;
    const re = new RegExp(`(${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig");
    out = out.replace(re, "<mark>$1</mark>");
  });
  return out;
}

function renderKept() {
  const counts = { "": state.kept.length };
  state.kept.forEach((r) => { counts[r.category || "main"] = (counts[r.category || "main"] || 0) + 1; });
  // Filters only appear once there's something to filter: a course or tag shows up after its first keep.
  const has = state.kept.length > 0;
  let shownCats = 0;
  $("#keptCats").querySelectorAll(".cat").forEach((b) => {
    const n = counts[b.dataset.cat] || 0, on = b.dataset.cat === state.keptCat;
    b.classList.toggle("is-active", on);
    b.hidden = !n && !on;
    if (!b.hidden) shownCats++;
    b.setAttribute("aria-checked", on);
    b.querySelector(".cat-n").textContent = "";
  });
  $("#keptCats").hidden = !has;
  $("#keptCats").style.gridTemplateColumns = `repeat(${Math.max(shownCats, 1)}, 1fr)`;
  const avail = new Set(state.kept.flatMap((r) => r.tags || []).filter((t) => TAG[t]));
  const sig = [...avail].sort().join() + "|" + [...state.keptWant].sort().join();
  if ($("#keptTags")._sig !== sig) {
    $("#keptTags")._sig = sig;
    renderTagRow($("#keptTags"), state.keptWant, onKeptWant, avail);
  }
  $(".search").hidden = !has;
  const inCat = (r) => (!state.keptCat || (r.category || "main") === state.keptCat) && [...state.keptWant].every((t) => (r.tags || []).includes(t));
  const sources = ["All", ...new Set(state.kept.filter(inCat).map((r) => r.source))];
  if (!sources.includes(state.source)) state.source = "All";
  $("#chips").innerHTML = sources.length > 2
    ? sources.map((s) => `<button class="chip ${s === state.source ? "is-active" : ""}" data-source="${esc(s)}">${esc(s)}</button>`).join("")
    : "";

  const terms = norm(state.query).split(/\s+/).filter(Boolean);
  const rows = state.kept.filter((r) => {
    if (!inCat(r)) return false;
    if (state.source !== "All" && r.source !== state.source) return false;
    return terms.every((t) => norm(`${r.title} ${r.source} ${r.description || ""}`).includes(t));
  });

  $("#list").innerHTML = rows.map((r, i) => {
    const t = tagIcons(r, 4);
    return `
    <li class="item${r.id === state.freshId ? " fresh" : ""}" data-id="${r.id}" style="animation-delay:${r.id === state.freshId ? 0 : Math.min(i, 12) * 20}ms">
      <img src="${esc(r.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" />
      <a href="${esc(r.url)}" target="_blank" rel="noopener">
        <h4>${highlight(r.title, state.query.split(/\s+/).filter(Boolean))}</h4>
        <small>${esc(r.source)}${t.length ? `<span class="mini">${t.map((k) => `<span title="${TAG[k].l}">${icon(TAG[k].i)}</span>`).join("")}</span>` : ""}</small>
      </a>
      <button class="sh" aria-label="Share ${esc(r.title)}" title="Share">${icon("share")}</button>
      <button class="rm" aria-label="Remove ${esc(r.title)}" title="Remove">${icon("x")}</button>
    </li>`;
  }).join("");
  state.freshId = null;
  renderFeatured();

  const empty = $("#keptEmpty");
  empty.hidden = rows.length > 0;
  const [ic, , label] = CATS[state.keptCat];
  $("#emptyIcon").innerHTML = icon(state.kept.length ? ic : "heart");
  empty.querySelector("p").textContent = !state.kept.length
    ? "Nothing kept yet. Go swipe right on something delicious."
    : state.query
      ? "No keepers match that. Try another word."
      : state.keptWant.size
        ? `No ${[...state.keptWant].map((t) => TAG[t].l.toLowerCase()).join(" + ")} ${label} kept yet.`
        : `No ${label} kept yet. Go find some!`;
  const go = $("#emptyGo");
  go.hidden = !!(state.kept.length && state.query);
  go.textContent = state.kept.length && (state.keptCat || state.keptWant.size)
    ? `Swipe ${state.keptWant.size ? [...state.keptWant].map((t) => TAG[t].l.toLowerCase()).join(" + ") + " " : ""}${state.keptCat ? label : "these"}`
    : "Start swiping";
}

$("#list").addEventListener("click", async (e) => {
  const share = e.target.closest(".sh");
  if (share) return shareRecipe(state.kept.find((r) => r.id === share.closest(".item").dataset.id));
  const btn = e.target.closest(".rm");
  if (!btn) return;
  const li = btn.closest(".item");
  const id = li.dataset.id;
  li.classList.add("leaving");
  setTimeout(() => {
    state.kept = state.kept.filter((r) => r.id !== id);
    updateCount();
    renderKept();
  }, 280);
  const error = await store.unkeep(id);
  toast(error ? "Couldn't remove that" : "Removed");
  updateAcct();
});
$("#emptyGo").addEventListener("click", () => {
  if (state.kept.length && state.keptWant.size) {
    state.want = new Set(state.keptWant);
    saveSet("forks:want", state.want);
    renderTagRow($("#tags"), state.want, onWantChange);
  }
  if (state.kept.length && state.keptCat !== state.cat) setCat(state.keptCat); else if (state.keptWant.size) reshuffle();
  show("swipe");
});
$("#keptCats").addEventListener("click", (e) => {
  const b = e.target.closest(".cat");
  if (!b || b.dataset.cat === state.keptCat) return;
  state.keptCat = b.dataset.cat;
  state.source = "All";
  ls.set("forks:keptCat", state.keptCat);
  renderKept();
});
$("#chips").addEventListener("click", (e) => {
  const c = e.target.closest(".chip");
  if (!c) return;
  state.source = c.dataset.source;
  renderKept();
});
$("#search").addEventListener("input", (e) => { state.query = e.target.value; renderKept(); });

// ---------- sheets ----------
function openSheet(sel) {
  const s = $(sel);
  s.hidden = false;
  return s;
}
function closeSheet(sel, then) {
  const s = $(sel);
  if (s.hidden) return then?.();
  s.classList.add("closing");
  setTimeout(() => { s.hidden = true; s.classList.remove("closing"); then?.(); }, 230);
}
["#break", "#save", "#acct", "#people", "#landing", "#nameSheet"].forEach((sel) => $(sel).addEventListener("click", (e) => {
  if (e.target !== $(sel)) return;
  if (sel === "#break") $("#breakGo").click();
  else if (sel === "#save") skipSave();
  else if (sel === "#landing") $("#landGo").click();
  else closeSheet(sel);
}));

// 20-swipe check-in
function checkIn() {
  if (sheetOpen()) return;
  const kept = state.round.filter((s) => s.liked).map((s) => s.recipe);
  let ic, title, text;
  if (kept.length >= 8) {
    [ic, title] = pick([["flame", "On a roll"], ["chef-hat", "Chef's kiss"], ["sparkles", "Hungry much?"]]);
    text = `You kept ${kept.length} of your last ${BREAK_EVERY}. That's a lot of good dinners.`;
  } else if (kept.length) {
    [ic, title] = pick([["party-popper", "Twenty down"], ["sparkles", "Nice haul"], ["chef-hat", "Look at you go"]]);
    text = `${kept.length} new keeper${kept.length > 1 ? "s" : ""} from your last ${BREAK_EVERY} swipes.`;
  } else {
    [ic, title] = pick([["frown", "Tough crowd"], ["search", "Picky, picky"]]);
    text = `Nothing grabbed you in the last ${BREAK_EVERY}. Maybe try another course?`;
  }
  $("#breakIcon").innerHTML = icon(ic);
  $("#breakTitle").textContent = title;
  $("#breakText").textContent = text;
  $("#breakThumbs").innerHTML = thumbs(kept);
  $("#breakStop").textContent = kept.length ? "I'm done for today" : "Call it a day";
  openSheet("#break");
  $("#breakGo").focus({ preventScroll: true });
  if (kept.length) setTimeout(() => { const r = $("#breakThumbs").getBoundingClientRect(); hearts(r.left + r.width / 2, r.top); }, 500);
}
function thumbs(list) {
  const shown = list.slice(-5);
  return shown.map((r, i) => `<img src="${esc(r.image)}" alt="" referrerpolicy="no-referrer" style="animation-delay:${200 + i * 70}ms" />`).join("") +
    (list.length > shown.length ? `<span class="more" style="animation-delay:${200 + shown.length * 70}ms">+${list.length - shown.length}</span>` : "");
}
$("#breakGo").addEventListener("click", () => { state.round = []; closeSheet("#break", () => toast(pick(["Back to it", "Onward", "Let's eat"]))); });
$("#breakStop").addEventListener("click", () => {
  state.round = [];
  closeSheet("#break", () => {
    show("kept");
    if (!state.user && state.kept.length) openSave("manual");
    else toast(state.kept.length ? "Good picks. See you tomorrow" : "See you tomorrow");
  });
});

// ---------- account: save your keeps / magic link ----------
const browsing = () => ls.get("forks:browsing", false);
const shouldOfferSave = () =>
  !state.user && !state.ctaShown && !browsing() && Object.keys(guest.swipes).length >= CTA_AFTER && guest.kept.length >= 1;

function setSave(mode, email = "") {
  const keeps = guest.kept.length;
  const form = $("#saveForm");
  form.dataset.mode = mode;
  $("#saveErr").hidden = true;
  const field = mode === "cta" || mode === "manual";
  $("#saveField").hidden = !field;
  $("#saveSkip").hidden = !field;
  $("#saveThumbs").innerHTML = mode === "cta" ? thumbs(guest.kept.slice(0, 5).reverse()) : "";
  $("#saveGo").disabled = false;
  if (mode === "cta") {
    $("#saveIcon").innerHTML = icon("bookmark");
    $("#saveTitle").textContent = "Don't lose your keeps";
    $("#saveText").textContent = `You've kept ${keeps} so far. Add your email and we'll save them. No password, just a magic link.`;
    $("#saveGo").textContent = "Save my keeps";
    $("#saveSkip").textContent = "No thanks, just browsing";
  } else if (mode === "manual") {
    $("#saveIcon").innerHTML = icon(keeps ? "bookmark" : "mail");
    $("#saveTitle").textContent = keeps ? "Save your keeps" : "Sign in";
    $("#saveText").textContent = keeps
      ? `Your ${keeps} keep${keeps === 1 ? " lives" : "s live"} on this device for now. Add your email to save ${keeps === 1 ? "it" : "them"} anywhere.`
      : "Enter your email and we'll send a magic link. No password needed.";
    $("#saveGo").textContent = keeps ? "Save my keeps" : "Send my link";
    $("#saveSkip").textContent = "Not now";
  } else if (mode === "sent-new") {
    $("#saveIcon").innerHTML = icon("mail-check");
    $("#saveTitle").textContent = "Saved. Check your inbox";
    $("#saveText").textContent = `We sent a link to ${email}. Tap it to finish signing in, on this phone or any other.${keeps ? " Your keeps are already saved to your account." : ""}`;
    $("#saveGo").textContent = "Keep swiping";
  } else if (mode === "sent-existing") {
    $("#saveIcon").innerHTML = icon("mail");
    $("#saveTitle").textContent = "Welcome back";
    $("#saveText").textContent = `${email} already has an account, so we sent you a magic link to sign in.${keeps ? " Today's keeps come along when you tap it." : ""}`;
    $("#saveGo").textContent = "Keep swiping";
  }
}
function openSave(mode) {
  if (state.user || (mode === "cta" && sheetOpen())) return;
  setSave(mode);
  openSheet("#save");
  if (matchMedia("(hover: hover)").matches) setTimeout(() => $("#saveEmail").focus(), 300);
}
function skipSave() {
  if ($("#saveForm").dataset.mode === "cta") { ls.set("forks:browsing", true); closeSheet("#save", () => toast("Happy browsing. Your keeps stay on this device.")); }
  else closeSheet("#save");
}
function saveError(msg) {
  const e = $("#saveErr");
  e.textContent = msg;
  e.hidden = false;
  $("#saveGo").disabled = false;
  $("#saveGo").classList.remove("is-busy");
}
$("#saveSkip").addEventListener("click", skipSave);
$("#saveForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const mode = $("#saveForm").dataset.mode;
  if (mode.startsWith("sent")) return closeSheet("#save");
  const email = $("#saveEmail").value.trim().toLowerCase();
  if (!EMAIL_OK.test(email)) return saveError("That doesn't look like an email address.");
  $("#saveGo").disabled = true;
  $("#saveGo").classList.add("is-busy");
  const { p_liked: liked, p_noped: noped } = guestIds();
  let res, json = {};
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/meals-auth`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SUPABASE_ANON}`, apikey: SUPABASE_ANON, "content-type": "application/json" },
      body: JSON.stringify({ email, origin: location.origin, guest: { liked, noped } }),
    });
    json = await res.json().catch(() => ({}));
  } catch { return saveError("Couldn't reach the kitchen. Try again?"); }
  $("#saveGo").classList.remove("is-busy");
  if (res.ok && json.status === "new") { ls.set("forks:pendingEmail", email); return setSave("sent-new", email); }
  if (res.ok && json.status === "existing") { ls.set("forks:pendingEmail", email); return setSave("sent-existing", email); }
  if (json.error === "slow_down") return saveError("We just sent you a link. Give it a minute, then try again.");
  if (json.error === "email_not_configured") return saveError("Email sign-in isn't switched on yet. Your keeps are safe on this device for now.");
  saveError("Couldn't send that. Try again?");
});

// Signed-in account sheet
$("#acctBtn").addEventListener("click", () => {
  if (!state.user) return openSave("manual");
  $("#acctSheetIcon").innerHTML = icon("circle-user-round");
  if (state.me?.name) $("#acctSheetIcon").innerHTML = avatar(state.me.name, "xl", state.me.color);
  $("#acctTitle").textContent = state.me?.name ? `Hi ${state.me.name}` : "You're signed in";
  $("#acctText").textContent = `${state.user.email}. Your keeps are saved to your account.`;
  $("#acctShareIc").innerHTML = icon("share");
  $("#acctShareUrl").textContent = state.me?.share_code ? `forkslist.com/${state.me.share_code}` : "Add your first name to get your link";
  openSheet("#acct");
});
// Share your keeps: an unlisted link anyone can open to see and follow your list.
$("#acctShare").addEventListener("click", async () => {
  if (!state.me?.share_code) {
    if (state.user) ls.del(`forks:nameLater:${state.user.id}`);
    return closeSheet("#acct", askName);
  }
  const url = `${location.origin}/${state.me.share_code}`;
  try {
    if (navigator.share) { await navigator.share({ title: `${state.me.name}'s keeps on forks.`, text: `${state.me.name}'s keeps on forks. Swipe right on dinner.`, url }); return; }
  } catch (err) { if (err?.name === "AbortError") return; }
  try { await navigator.clipboard.writeText(url); toast("Link copied"); }
  catch { prompt("Copy this link", url); }
});
$("#acctDone").addEventListener("click", () => closeSheet("#acct"));
// Delete account: tap once to arm, again to confirm.
$("#acctDelete").addEventListener("click", async () => {
  const b = $("#acctDelete");
  if (!b.classList.contains("armed")) {
    b.classList.add("armed");
    b.textContent = "Tap again to erase your account and keeps";
    clearTimeout(b._t);
    b._t = setTimeout(() => { b.classList.remove("armed"); b.textContent = "Delete my account"; }, 4000);
    return;
  }
  b.textContent = "Deleting…";
  const { data } = await db.auth.getSession();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/meals-account`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${data.session?.access_token}`, apikey: SUPABASE_ANON },
  }).catch(() => null);
  b.classList.remove("armed");
  b.textContent = "Delete my account";
  if (!res?.ok) return toast("Couldn't delete that. Try again?");
  await db.auth.signOut();
  closeSheet("#acct", () => toast("Account deleted. Everything's gone."));
});
$("#acctOut").addEventListener("click", async () => {
  await db.auth.signOut();
  closeSheet("#acct", () => toast("Signed out"));
});
function updateAcct() {
  $("#acctBtn").classList.toggle("is-in", !!state.user);
  // Once they've told us their name, their initial (in their color) is the profile picture.
  const me = state.user && state.me?.name ? state.me : null;
  $("#acctBtn").classList.toggle("has-avatar", !!me);
  $("#acctIcon").innerHTML = me ? avatar(me.name, "hd", me.color) : icon("circle-user-round");
  $("#acctBtn").setAttribute("aria-label", state.user ? `Signed in as ${state.user.email}` : "Save your keeps");
  $("#acctDot").hidden = !!state.user || !guest.kept.length;
}

// Auth state drives whose swipes we show.
async function setUser(user, { merge = false } = {}) {
  const changed = (user?.id ?? null) !== (state.user?.id ?? null);
  state.user = user;
  if (user && merge) {
    const n = await mergeGuest();
    toast(n ? `Signed in. ${n} keep${n === 1 ? "" : "s"} saved` : "Signed in");
  }
  updateAcct();
  if (changed || merge) {
    await loadSocial();
    state.history = [];
    state.round = [];
    await loadKept();
    reshuffle();
  }
}

// ---------- social: follows, featured lists, sharing ----------
const GUEST_FOLLOWS = "forks:follows";
async function loadPeople() {
  const { data } = await db.rpc("meals_people", { p_ids: state.user ? [] : [...state.follows] });
  state.people = data || [];
  if (state.people.length) {
    // Colors come from each name card (works for unlisted profiles you follow, too).
    await Promise.all(state.people.map(async (p) => {
      try {
        const { data: card } = await db.rpc("meals_profile_card", { p_handle: p.handle });
        p.color = card?.[0]?.color || null;
      } catch (e) { console.error(e); }
    }));
  }
  state.featured = state.people.filter((p) => p.is_featured);
  renderFeatured();
}
async function loadSocial() {
  if (state.user) {
    // Bring along anything followed as a guest.
    const local = ls.get(GUEST_FOLLOWS, []);
    if (local.length) {
      await db.from("meals_follows").upsert(local.map((followee) => ({ follower: state.user.id, followee })), { onConflict: "follower,followee", ignoreDuplicates: true });
      ls.del(GUEST_FOLLOWS);
    }
    const { data } = await db.from("meals_follows").select("followee");
    state.follows = new Set((data || []).map((d) => d.followee));
    const { data: me } = await db.from("meals_profiles").select("handle,name,color,share_code").eq("user_id", state.user.id).maybeSingle();
    state.me = me || null;
  } else {
    state.follows = new Set(ls.get(GUEST_FOLLOWS, []));
    state.me = null;
  }
  await loadPeople();
}
async function setFollow(userId, on) {
  on ? state.follows.add(userId) : state.follows.delete(userId);
  if (state.user) {
    if (on) await db.from("meals_follows").upsert({ follower: state.user.id, followee: userId }, { onConflict: "follower,followee", ignoreDuplicates: true });
    else await db.from("meals_follows").delete().eq("followee", userId);
  } else ls.set(GUEST_FOLLOWS, [...state.follows]);
  await loadPeople();
}
const followBtn = (on) => `${icon(on ? "user-check" : "user-plus")}<span>${on ? "Following" : "Follow"}</span>`;

// "Others' keeps": story-style circles for the featured list and everyone you follow. Tap to open their list.
function renderFeatured() {
  const list = (state.people || []).filter((p) => p.user_id !== state.user?.id);
  $("#othersWrap").hidden = !list.length;
  $("#featured").innerHTML = list.map((p) => {
    const on = state.follows.has(p.user_id);
    return `
    <button class="story ${on ? "is-on" : ""}" data-handle="${esc(p.handle)}" aria-label="${esc(p.name)}'s keeps, ${p.keeps} recipes${on ? ", following" : ""}">
      <span class="story-ring">${avatar(p.name, "lg", p.color)}${on ? `<i class="story-check">${icon("check")}</i>` : ""}</span>
      <b>${esc(p.name)}</b>
      <small>${p.keeps} keep${Number(p.keeps) === 1 ? "" : "s"}</small>
    </button>`;
  }).join("");
}
$("#featured").addEventListener("click", (e) => {
  const s = e.target.closest(".story");
  if (s) openPeople(s.dataset.handle);
});

// Someone's public list, with a heart to keep any of their recipes.
let peopleList = [], peopleProfile = null;
async function profileFor(handle) {
  const f = state.people.find((p) => p.handle === handle);
  if (f) return f;
  // Unlisted profiles resolve by handle: whoever has the link can see the name and follow.
  const { data } = await db.rpc("meals_profile_card", { p_handle: handle });
  return data?.[0] || null;
}
async function openPeople(handle) {
  peopleProfile = await profileFor(handle);
  if (!peopleProfile) return toast("Couldn't find that list");
  const { data } = await db.rpc("meals_public_keeps", { p_handle: handle });
  peopleList = (data || []).filter((r) => !JUNK.test(r.title)).map(clean);
  $("#peopleAvatar").outerHTML = avatar(peopleProfile.name, "", peopleProfile.color).replace('class="avatar ', 'id="peopleAvatar" class="avatar ');
  $("#peopleName").textContent = `${peopleProfile.name}'s keeps`;
  $("#peopleCount").textContent = `${peopleList.length} recipe${peopleList.length === 1 ? "" : "s"}`;
  renderPeople();
  openSheet("#people");
}
function renderPeople() {
  const on = state.follows.has(peopleProfile.user_id);
  const fb = $("#peopleFollow");
  fb.hidden = peopleProfile.user_id === state.user?.id;
  fb.className = `follow ${on ? "is-on" : ""}`;
  fb.innerHTML = followBtn(on);
  const mine = new Set(state.kept.map((r) => r.id));
  $("#peopleList").innerHTML = peopleList.map((r) => `
    <li data-id="${r.id}">
      <img src="${esc(r.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" />
      <a href="${esc(r.url)}" target="_blank" rel="noopener"><b>${esc(r.title)}</b><small>${esc(r.source)}</small></a>
      <button class="keep ${mine.has(r.id) ? "is-on" : ""}" aria-label="${mine.has(r.id) ? "Kept" : "Keep"} ${esc(r.title)}">${icon("heart")}</button>
    </li>`).join("");
}
$("#peopleFollow").addEventListener("click", async () => {
  const on = !state.follows.has(peopleProfile.user_id);
  await setFollow(peopleProfile.user_id, on);
  renderPeople();
  toast(on ? `Following ${peopleProfile.name}` : "Unfollowed");
});
$("#peopleList").addEventListener("click", async (e) => {
  const b = e.target.closest(".keep");
  if (!b) return;
  const r = peopleList.find((x) => x.id === b.closest("li").dataset.id);
  if (b.classList.contains("is-on")) {
    await store.unkeep(r.id);
    state.kept = state.kept.filter((x) => x.id !== r.id);
  } else {
    await store.swipe(r, true);
    state.kept.unshift({ ...r, swiped_at: new Date().toISOString() });
    state.freshId = r.id;
    const rect = b.getBoundingClientRect();
    hearts(rect.left + rect.width / 2, rect.top);
  }
  // Drop it from the deck if it was queued.
  state.deck = state.deck.filter((x) => x.id !== r.id);
  updateCount(true); renderKept(); renderPeople(); updateAcct(); render();
});
$("#peopleClose").addEventListener("click", () => closeSheet("#people"));

// Share a keep: the link opens a landing page that shows the recipe and invites them to swipe.
// Recipes with a pre-rendered preview get a /s/<id>/ link (rich preview in iMessage, Slack, etc.).
let ogIds = null;
async function hasPreview(id) {
  if (!ogIds) ogIds = fetch("/og/index.json").then((r) => (r.ok ? r.json() : [])).then((a) => new Set(a)).catch(() => new Set());
  return (await ogIds).has(id);
}
async function shareRecipe(r) {
  if (!r) return;
  const by = state.me?.share_code ? encodeURIComponent(state.me.share_code) : "";
  const url = (await hasPreview(r.id))
    ? `${location.origin}/s/${r.id}/${by ? `?by=${by}` : ""}`
    : `${location.origin}/?r=${r.id}${by ? `&by=${by}` : ""}`;
  const text = `${r.title}. Found it on forks, swipe right on dinner.`;
  try {
    if (navigator.share) { await navigator.share({ title: r.title, text, url }); return; }
  } catch (err) { if (err?.name === "AbortError") return; }
  try { await navigator.clipboard.writeText(url); toast("Link copied"); }
  catch { prompt("Copy this link", url); }
}

let landing = null;
async function showLanding(id, byHandle) {
  const { data } = await db.rpc("meals_recipe", { p_id: id });
  const r = data?.[0];
  if (!r) return;
  const recipe = clean(r);
  const by = byHandle ? await profileFor(byHandle) : null;
  const followTarget = by || state.featured[0] || null;
  landing = { recipe, followTarget };
  $("#landFrom").innerHTML = `${esc(by ? by.name : "Someone")} thinks<br>you'll love this…`;
  $("#landImg").src = recipe.image;
  $("#landCard").href = recipe.url;
  $("#landSource").textContent = recipe.source;
  $("#landTitle").textContent = recipe.title;
  const showFollow = followTarget && !state.follows.has(followTarget.user_id) && followTarget.user_id !== state.user?.id;
  $("#landFollowRow").hidden = !showFollow;
  if (showFollow) {
    $("#landAvatar").outerHTML = avatar(followTarget.name, "sm", followTarget.color).replace('class="avatar ', 'id="landAvatar" class="avatar ');
    $("#landFollowText").textContent = `Also follow ${followTarget.name}'s keeps`;
  }
  openSheet("#landing");
}
$("#landGo").addEventListener("click", async () => {
  const { recipe, followTarget } = landing;
  const follow = !$("#landFollowRow").hidden && $("#landFollow").checked;
  if (follow) await setFollow(followTarget.user_id, true);
  // The shared recipe becomes the first card, unless they've already swiped it.
  const seen = state.kept.some((k) => k.id === recipe.id) || guest.swipes[recipe.id] !== undefined;
  if (!seen) {
    await attachKeptBy([recipe]);
    state.deck = state.deck.filter((x) => x.id !== recipe.id);
    state.deck.push(recipe);
    render();
  }
  show("swipe");
  closeSheet("#landing", () => toast(follow ? `Following ${followTarget.name}. Swipe away` : "Swipe away"));
});

// ---------- first name (asked once, on first sign-in) ----------
function askName() {
  if (!state.user || state.me?.name || !$("#nameSheet").hidden) return;
  if (ls.get(`forks:nameLater:${state.user.id}`, false)) return;
  $("#nameErr").hidden = true;
  $("#nameInput").value = "";
  pickedColor = BRAND[Math.floor(Math.random() * BRAND.length)]; // random brand color, kept on save
  previewKey = null;
  previewName();
  openSheet("#nameSheet");
  setTimeout(() => $("#nameInput").focus(), 300);
}
let pickedColor = null, previewKey = null;
// Only redraw (and pop) when the initial changes, not on every keystroke.
function previewName() {
  const v = $("#nameInput").value.trim();
  const key = v ? v.charAt(0).toUpperCase() : "";
  if (key === previewKey) return;
  previewKey = key;
  $("#namePreview").innerHTML = v ? avatar(v, "xl", pickedColor) : `<span class="avatar xl blank">${icon("circle-user-round")}</span>`;
}
$("#nameInput").addEventListener("input", previewName);
$("#nameForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("#nameInput").value.trim();
  if (!name) { $("#nameErr").textContent = "Add your first name, or tap Later."; $("#nameErr").hidden = false; return; }
  $("#nameGo").classList.add("is-busy");
  const { data, error } = await db.rpc("meals_save_name", { p_name: name, p_color: pickedColor });
  $("#nameGo").classList.remove("is-busy");
  if (error) { $("#nameErr").textContent = "Couldn't save that. Try again?"; $("#nameErr").hidden = false; return; }
  state.me = data;
  // Pick up the share code assigned to the new profile.
  const { data: row } = await db.from("meals_profiles").select("handle,name,color,share_code").eq("user_id", state.user.id).maybeSingle();
  if (row) state.me = row;
  updateAcct();
  closeSheet("#nameSheet", () => toast(`Hi ${data.name}`));
});
$("#nameSkip").addEventListener("click", () => {
  if (state.user) ls.set(`forks:nameLater:${state.user.id}`, true);
  closeSheet("#nameSheet");
});

// ---------- tabs & keys ----------
function show(view) {
  document.querySelectorAll(".tab").forEach((t) => {
    const on = t.dataset.view === view;
    t.classList.toggle("is-active", on);
    t.setAttribute("aria-selected", on);
  });
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("is-active", v.id === `view-${view}`));
  ls.set("forks:view", view);
  if (view === "kept") setTimeout(() => matchMedia("(hover: hover)").matches && $("#search").focus(), 50);
}
document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => show(t.dataset.view)));
$("#logoBtn").addEventListener("click", () => { show("swipe"); window.scrollTo({ top: 0, behavior: "smooth" }); });

$("#btnLike").addEventListener("click", () => swipe(true));
$("#btnNope").addEventListener("click", () => swipe(false));
$("#btnUndo").addEventListener("click", undo);

document.addEventListener("keydown", (e) => {
  if (!$("#break").hidden) { if (e.key === "Escape") $("#breakGo").click(); return; }
  if (!$("#save").hidden) { if (e.key === "Escape") skipSave(); return; }
  if (!$("#acct").hidden) { if (e.key === "Escape") closeSheet("#acct"); return; }
  if (!$("#people").hidden) { if (e.key === "Escape") closeSheet("#people"); return; }
  if (!$("#landing").hidden) { if (e.key === "Escape" || e.key === "Enter") $("#landGo").click(); return; }
  if (!$("#nameSheet").hidden) { if (e.key === "Escape") closeSheet("#nameSheet"); return; }
  if (e.target.matches("input")) { if (e.key === "Escape") e.target.blur(); return; }
  if (!$("#view-swipe").classList.contains("is-active")) {
    if (e.key === "/") { e.preventDefault(); $("#search").focus(); }
    return;
  }
  if (e.key.startsWith("Arrow")) e.preventDefault(); // arrows swipe, never scroll
  if (e.key === "ArrowRight") swipe(true);
  else if (e.key === "ArrowLeft") swipe(false);
  else if (e.key === "ArrowUp") { const r = state.deck.at(-1); if (r) window.open(r.url, "_blank", "noopener"); }
  else if (e.key === "Backspace" || (e.key === "z" && (e.metaKey || e.ctrlKey))) { e.preventDefault(); undo(); }
});

// ---------- boot ----------
$("#btnUndo").innerHTML = icon("undo-2");
$("#btnNope").innerHTML = icon("x");
$("#btnLike").innerHTML = icon("heart");
$("#btnOpen").innerHTML = icon("external-link");
$("#acctIcon").innerHTML = icon("circle-user-round");
$("#searchIcon").innerHTML = icon("search");
$("#footHeart").innerHTML = icon("heart");

const v = ls.get("forks:view", "swipe");
if (v === "kept") show("kept");
const c = ls.get("forks:cat", "");
if (c in CATS) state.cat = c;
const kc = ls.get("forks:keptCat", "");
if (kc in CATS) state.keptCat = kc;
renderCats($("#cats"), state.cat, false);
renderCats($("#keptCats"), state.keptCat, true);
state.want = loadSet("forks:want");
state.keptWant = loadSet("forks:keptWant");
renderTagRow($("#tags"), state.want, onWantChange);
function onKeptWant() { $("#keptTags")._sig = null; saveSet("forks:keptWant", state.keptWant); renderKept(); }

(async () => {
  // Arriving from a magic link?
  const params = new URLSearchParams(location.search);
  const hash = params.get("login");
  const shared = params.get("r"), sharedBy = params.get("by"), sharedUser = params.get("u");
  if ((shared || sharedUser) && !hash) history.replaceState(null, "", location.pathname);
  let merge = false;
  if (hash) {
    history.replaceState(null, "", location.pathname);
    const { error } = await db.auth.verifyOtp({ token_hash: hash, type: "magiclink" });
    if (error) { toast("That link has expired. Send yourself a fresh one."); setTimeout(() => openSave("manual"), 600); }
    else { merge = true; ls.del("forks:pendingEmail"); }
  }
  const { data } = await db.auth.getSession();
  await setUser(data.session?.user ?? null, { merge });
  if (state.user) setTimeout(askName, merge ? 1200 : 400);
  if (!state.user) { await loadSocial(); await loadKept(); refill(); }
  // Arriving from a shared profile (/?u=handle)? Show their list with a Follow button.
  // Profile links are forkslist.com/<code> (served by SPA routing); ?u= still works.
  const pathCode = location.pathname.match(/^\/([a-z]{3}\d{4})\/?$/i)?.[1];
  if (pathCode) history.replaceState(null, "", "/");
  const profileKey = pathCode || sharedUser;
  if (!shared && profileKey && /^[a-z0-9_]{2,24}$/i.test(profileKey)) openPeople(profileKey.toLowerCase());
  // Arriving from a shared recipe?
  if (shared && /^[0-9a-f-]{36}$/i.test(shared)) showLanding(shared, sharedBy && /^[a-z0-9_]{2,24}$/i.test(sharedBy) ? sharedBy.toLowerCase() : null);
  db.auth.onAuthStateChange((_evt, session) => {
    if ((session?.user?.id ?? null) !== (state.user?.id ?? null)) setUser(session?.user ?? null);
  });
})();
