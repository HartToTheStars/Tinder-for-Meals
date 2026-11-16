import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
import { icon } from "/icons.js?v=48";

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
// Staging (any here.now address except production's own) wears a badge so it's never mistaken for forkslist.com.
if (/\.here\.now$/.test(location.hostname) && !location.hostname.startsWith("humble-aura-cbq3.")) {
  const badge = document.createElement("div");
  badge.className = "env-badge";
  badge.textContent = "Staging";
  document.body.append(badge);
  // Keep staging out of search results so it never competes with forkslist.com.
  const robots = document.createElement("meta");
  robots.name = "robots";
  robots.content = "noindex, nofollow";
  document.head.append(robots);
}

function toast(msg, action) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.toggle("has-action", !!action);
  if (action) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "toast-act";
    b.textContent = action.label;
    b.onclick = () => { clearTimeout(toastTimer); t.classList.remove("show"); action.run(); };
    t.append(b);
  }
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), action ? 4500 : 2200);
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
  async rekeep(r) {
    if (state.user) {
      return (await db.from("meals_user_swipes").upsert(
        { user_id: state.user.id, recipe_id: r.id, liked: true, swiped_at: r.swiped_at || new Date().toISOString() },
        { onConflict: "user_id,recipe_id" })).error;
    }
    guest.swipes[r.id] = true;
    guest.kept = [slim(r), ...guest.kept.filter((x) => x.id !== r.id)];
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
  // Drop the right-edge fade once the row is scrolled to its end (or doesn't scroll at all).
  if (!el._fadeBound) {
    el._fadeBound = true;
    const edge = () => el.classList.toggle("at-end", el.scrollLeft + el.clientWidth >= el.scrollWidth - 2);
    el.addEventListener("scroll", edge, { passive: true });
    addEventListener("resize", edge);
    el._edge = edge;
  }
  requestAnimationFrame(() => el._edge());
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
    <div class="card-loader" aria-hidden="true"><div class="spinner"></div><p>Setting the table…</p></div>
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
  const visible = state.deck.slice(-5); // top card + two fanned out on each side
  const existing = new Map([...deckEl.querySelectorAll(".card:not(.toss)")].map((el) => [el.dataset.id, el]));
  const keep = new Set(visible.map((r) => r.id));
  existing.forEach((el, id) => { if (!keep.has(id) && !el.classList.contains("gone")) el.remove(); });

  // DOM order mirrors deck order: last child is the top card. Cards already on the deck are never moved
  // (re-inserting a node restarts its deal animation, which made the stack dip); only new ones are inserted.
  const els = visible.map((r) => {
    let el = existing.get(r.id);
    if (!el || el.classList.contains("gone")) {
      el = document.createElement("article");
      el.className = dealt ? "card deal" : "card";
      el.addEventListener("animationend", (e) => { if (e.animationName === "deal") el.classList.remove("deal"); });
      el.dataset.id = r.id;
      el.dataset.side = (fanSide = fanSide === "l" ? "r" : "l");
      el.innerHTML = cardHTML(r);
      const img = el.querySelector("img");
      if (!img.complete) {
        el.classList.add("loading");
        const shown = () => {
          el.classList.remove("loading");
          if (el === topCard()) maybeTeach(el);
        };
        img.addEventListener("load", shown, { once: true });
        img.addEventListener("error", shown, { once: true });
      }
      img.onerror = () => img.remove();
    }
    return el;
  });
  els.forEach((el, i) => {
    if (el.isConnected) return;
    const below = els.slice(0, i).reverse().find((e) => e.isConnected);
    if (below) below.after(el);
    else {
      const above = els.slice(i + 1).find((e) => e.isConnected);
      above ? above.before(el) : deckEl.appendChild(el);
    }
  });
  // Cards flying away stay where they are in the DOM (moving them would restart animations); they render on top via z-index.
  deckEl.querySelectorAll(".card.gone").forEach((g) => g.removeAttribute("data-depth"));
  restack();

  const top = topCard();
  if (top) bindDrag(top);
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
        ? `<div class="big">${want.map((t) => icon(TAG[t].i)).join("")}</div><h3>Nothing left that fits your filters.</h3><div class="row"><button class="btn" id="btnClearTags">Clear filters</button><button class="btn btn-ghost" id="btnHarvest">Find fresh recipes</button></div>`
      : state.cat
        ? `<div class="big">${icon(CATS[state.cat][0])}</div><h3>That's every one of the ${CATS[state.cat][2]}.</h3><div class="row"><button class="btn" id="btnAll">Show everything</button><button class="btn btn-ghost" id="btnHarvest">Find fresh recipes</button></div>`
        : `<div class="big">${icon("chef-hat")}</div><h3>You've seen it all</h3><p>Want me to check the kitchens for new recipes?</p><button class="btn" id="btnHarvest">Find fresh recipes</button>`;
    deckMsg.hidden = false;
    $("#btnHarvest")?.addEventListener("click", harvest);
    $("#btnAll")?.addEventListener("click", () => setCat(""));
    $("#btnClearTags")?.addEventListener("click", () => { state.want.clear(); onWantChange(); });
  } else deckMsg.hidden = true; // each card shows its own "Setting the table" until its photo fades in

  if (top && !top.classList.contains("loading")) maybeTeach(top);
  if (state.deck.length < 5 && !state.dry && !state.busy) refill();
}

// Depth in the stack drives the fan (0 = top); the side was fixed when the card was made.
// A card that's still being stamped ("holding") keeps its spot, so the rest only move up once it's thrown.
function restack() {
  const holding = deckEl.querySelectorAll(".card.gone.holding").length;
  [...deckEl.querySelectorAll(".card:not(.gone):not(.toss)")].reverse().forEach((c, i) => { c.dataset.depth = Math.min(i + holding, 5); });
}
let fanSide = "r"; // the next card dealt goes on the other side from the last one
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
  deckMsg.innerHTML = `<div class="spinner"></div><p>Setting the table…</p>`;
  deckMsg.hidden = false;
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
  if (taught || el.classList.contains("loading")) return;
  if (teach(el)) { taught = true; armIdle(); }
}
// Sitting on the deck without swiping: lean KEEP / NOPE again as a nudge.
const IDLE_MS = 7000;
let idleT = 0;
function armIdle(extra = 0) { clearTimeout(idleT); idleT = setTimeout(idleNudge, IDLE_MS + extra); }
function idleNudge() {
  const el = topCard();
  const deckShowing = deckEl.offsetParent !== null && !el?.classList.contains("loading");
  if (!el || document.hidden || sheetOpen() || !deckShowing || el.classList.contains("dragging")) return armIdle();
  if (teach(el, 0)) armIdle(1800);
  else armIdle();
}
["pointerdown", "keydown", "wheel", "touchstart"].forEach((t) => addEventListener(t, () => armIdle(), { passive: true }));
document.addEventListener("visibilitychange", () => { if (!document.hidden) armIdle(); });

function teach(el, delay = 500) {
  if (el._teaching || matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
  el._teaching = true;
  const like = el.querySelector(".stamp-like"), nope = el.querySelector(".stamp-nope");
  const lean = (x, r) => `translate(${x}px, 0) rotate(${r}deg)`;
  const card = el.animate([
    { transform: lean(0, 0), offset: 0 },
    { transform: lean(36, 3), offset: 0.22 },
    { transform: lean(36, 3), offset: 0.38 },
    { transform: lean(-36, -3), offset: 0.62 },
    { transform: lean(-36, -3), offset: 0.78 },
    { transform: lean(0, 0), offset: 1 },
  ], { duration: 1800, delay, easing: "cubic-bezier(.45,0,.25,1)", fill: "forwards" });
  const fade = (stamp, a, b, c, d) => stamp.animate([
    { opacity: 0, offset: 0 }, { opacity: 0, offset: a }, { opacity: 0.9, offset: b },
    { opacity: 0.9, offset: c }, { opacity: 0, offset: d }, { opacity: 0, offset: 1 },
  ], { duration: 1800, delay, fill: "forwards" });
  const anims = [card, fade(like, 0.05, 0.22, 0.38, 0.5), fade(nope, 0.5, 0.62, 0.78, 0.92)];
  const stop = () => { anims.forEach((a) => a.cancel()); el._teaching = false; };
  card.finished.then(stop).catch(() => {});
  el.addEventListener("pointerdown", stop, { once: true });
  document.addEventListener("keydown", stop, { once: true });
  el._stopTeach = stop;
  return true;
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
    el._fling = { dx, dy: dy * 0.4 };
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

const sheetOpen = () => ["#break", "#save", "#acct", "#people", "#landing", "#nameSheet", "#together", "#mailPrev"].some((s) => !$(s).hidden);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const buzz = (pattern) => { try { navigator.vibrate?.(pattern); } catch (e) { /* not supported */ } };
async function stampSlam(el, stamp, s, f, after = restack) {
  const dragged = !!f;
  f = f || { dx: 0, dy: 0 };
  el.style.transition = "none";
  const from = `translate(${f.dx}px, ${f.dy}px) rotate(${f.dx / 14}deg)`;
  const shown = Number(stamp.style.opacity) || 0;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    stamp.style.opacity = 1;
    el.classList.remove("holding");
    after();
    await el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, delay: 120, fill: "forwards" }).finished;
    return;
  }
  const span = stamp.querySelector("span"), rot = s > 0 ? -10 : 10;
  // Dragged: the card stays where you let go (just a small nudge onward), and the stamp that's already
  // showing pops instead of starting over. Button / arrow key: lean out first, then the full slam.
  const lx = dragged ? f.dx + s * 12 : s * 54, ly = dragged ? f.dy : 0, lr = dragged ? f.dx / 14 + s * 1.5 : s * 5;
  const lean = `translate(${lx}px, ${ly}px) rotate(${lr}deg)`;
  el.animate([{ transform: from }, { transform: lean }], { duration: dragged ? 90 : 140, easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards" });
  stamp.style.opacity = 1;
  if (!dragged) stamp.animate([{ opacity: shown }, { opacity: 1 }], { duration: 90, fill: "forwards" });
  await span.animate(dragged && shown > 0.4 ? [
    { transform: `scale(1) rotate(${rot}deg)` },
    { transform: `scale(1.28) rotate(${rot * 1.4}deg)`, offset: 0.35 },
    { transform: `scale(.94) rotate(${rot}deg)`, offset: 0.7 },
    { transform: `scale(1) rotate(${rot}deg)` },
  ] : [
    { transform: `scale(2.4) rotate(${rot * 2.2}deg)`, opacity: 0 },
    { transform: `scale(.86) rotate(${rot}deg)`, opacity: 1, offset: 0.55 },
    { transform: `scale(1.06) rotate(${rot}deg)`, offset: 0.78 },
    { transform: `scale(1) rotate(${rot}deg)`, opacity: 1 },
  ], { duration: dragged ? 240 : 300, easing: "cubic-bezier(.2,.7,.3,1)", fill: "forwards" }).finished;
  buzz(s > 0 ? [14] : [8, 40, 8]);
  await el.animate([
    { transform: lean },
    { transform: `${lean} translate(${-s * 5}px, 2px)` },
    { transform: `${lean} translate(${s * 3}px, -1px)` },
    { transform: lean },
  ], { duration: 140, fill: "forwards" }).finished;
  await sleep(dragged ? 90 : 150);
  // Stamp done: now the next card moves up as this one is thrown.
  el.classList.remove("holding");
  after();
  // Throw onward from wherever it is: solid until it's off screen, a little spin, a short fade at the very end.
  const w = window.innerWidth, cw = el.offsetWidth;
  const tx = s * (w + cw * 0.9), ty = ly - 60, r1 = lr + s * 40;
  await el.animate([
    { transform: lean, opacity: 1 },
    { transform: `translate(${lx + (tx - lx) * 0.55}px, ${ly + (ty - ly) * 0.55}px) rotate(${lr + (r1 - lr) * 0.6}deg)`, opacity: 1, offset: 0.5 },
    { transform: `translate(${tx}px, ${ty}px) rotate(${r1}deg)`, opacity: 1, offset: 0.92 },
    { transform: `translate(${tx * 1.04}px, ${ty}px) rotate(${r1}deg)`, opacity: 0 },
  ], { duration: dragged ? 420 : 480, easing: "cubic-bezier(.22,.61,.36,1)", fill: "forwards" }).finished;
}

async function swipe(liked, evt) {
  const el = topCard();
  const recipe = state.deck[state.deck.length - 1];
  if (!el || !recipe || sheetOpen()) return;

  el._stopTeach?.();
  el.classList.add("gone", "holding");
  const stamp = el.querySelector(liked ? ".stamp-like" : ".stamp-nope");
  const s = liked ? 1 : -1;
  const drop = () => { el.remove(); restack(); }; // also unsticks the stack if the slam was interrupted
  stampSlam(el, stamp, s, evt?.pointerType ? el._fling : null).then(drop, drop);

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
  } catch { toast("The kitchens didn't answer. BRB."); }
  state.dry = false;
  await refill();
}

// ---------- kept ----------
async function loadKept() {
  state.kept = await store.kept();
  updateCount();
  renderKept();
  // Then fill in "Kept by Kelly and 3 others" from people you follow, and redraw once.
  const missing = state.kept.filter((r) => !r.keptBy);
  if (missing.length) { await attachKeptBy(missing).catch(() => {}); renderKept(); }
}

// Under each keep: who you follow also kept it. "Kept by Kelly", "Kelly and Hart", "Kelly and 3 others".
function keptByLine(r) {
  const ppl = r.keptBy?.people || [];
  if (!ppl.length) return "";
  const [a, b] = ppl;
  const who = ppl.length === 1 ? esc(a.name)
    : ppl.length === 2 ? `${esc(a.name)} and ${esc(b.name)}`
    : `${esc(a.name)} and ${ppl.length - 1} others`;
  return `<span class="kb"><span class="kb-faces">${ppl.slice(0, 3).map((p) => avatar(p.name, "xs", p.color)).join("")}</span><span class="kb-t">Kept by ${who}</span></span>`;
}

function updateCount(bump) {
  // Quiet counts: "Kept · 7" on the tab, "7 recipes saved" under the heading. Hidden at zero.
  const n = state.kept.length;
  const tab = $("#keptCount"), sub = $("#keptSub");
  tab.textContent = n;
  sub.textContent = `${n} recipe${n === 1 ? "" : "s"} saved`;
  tab.hidden = sub.hidden = !n;
  if (bump) for (const c of [tab, sub]) { c.classList.remove("bump"); void c.offsetWidth; c.classList.add("bump"); }
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
  // Search lives behind the icon next to "Your keeps."; it stays open while there's a query.
  $("#searchToggle").hidden = !has;
  $(".search").hidden = !has || !(state.searchOpen || state.query);
  const inCat = (r) => (!state.keptCat || (r.category || "main") === state.keptCat) && [...state.keptWant].every((t) => (r.tags || []).includes(t));
  // No source-site filter on Keeps (course and diet filters are enough).
  state.source = "All";
  $("#chips").innerHTML = "";

  const terms = norm(state.query).split(/\s+/).filter(Boolean);
  const rows = state.kept.filter((r) => {
    if (!inCat(r)) return false;
    if (state.source !== "All" && r.source !== state.source) return false;
    return terms.every((t) => norm(`${r.title} ${r.source} ${r.description || ""}`).includes(t));
  });

  $("#list").innerHTML = rows.map((r, i) => {
    const t = tagIcons(r, 4);
    return `
    <li class="swipe-row" data-id="${r.id}">
      <span class="swipe-bg swipe-open" aria-hidden="true">${icon("party-popper")}<b class="sw-label">Celebrate</b><b class="sw-big">Go big!</b></span>
      <span class="swipe-bg swipe-del" aria-hidden="true"><b>Remove</b>${icon("x")}</span>
      <div class="item${r.id === state.freshId ? " fresh" : ""}" data-id="${r.id}" style="animation-delay:${r.id === state.freshId ? 0 : Math.min(i, 12) * 20}ms">
      <img src="${esc(r.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" draggable="false" />
      <a href="${esc(r.url)}" target="_blank" rel="noopener" draggable="false">
        <h4>${highlight(r.title, state.query.split(/\s+/).filter(Boolean))}</h4>
        <small>${esc(r.source)}${t.length ? `<span class="mini">${t.map((k) => `<span title="${TAG[k].l}">${icon(TAG[k].i)}</span>`).join("")}</span>` : ""}</small>
        ${keptByLine(r)}
      </a>
      <button class="sh" aria-label="Share ${esc(r.title)}" title="Share">${icon("share")}</button>
      <button class="rm" aria-label="Remove ${esc(r.title)}" title="Remove">${icon("x")}</button>
      </div>
    </li>`;
  }).join("");
  state.freshId = null;
  warmPreviews();
  maybeHintKeepSwipe();
  renderFeatured();

  const empty = $("#keptEmpty");
  empty.hidden = rows.length > 0;
  const [ic, , label] = CATS[state.keptCat];
  $("#emptyIcon").innerHTML = icon(state.kept.length ? ic : "heart");
  empty.querySelector("p").textContent = !state.kept.length
    ? "No keeps yet. Go swipe right on something delicious."
    : state.query
      ? "No keeps match that. Try another word."
      : state.keptWant.size
        ? `No ${[...state.keptWant].map((t) => TAG[t].l.toLowerCase()).join(" + ")} ${label} keeps yet.`
        : `No ${label} keeps yet. Go swipe some!`;
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
  removeKeep(btn.closest(".swipe-row"));
});

async function removeKeep(row) {
  const id = row.dataset.id;
  const r = state.kept.find((x) => x.id === id);
  if (!r) return;
  const at = state.kept.indexOf(r);
  row.classList.add("leaving");
  const gone = new Promise((done) => setTimeout(() => {
    state.kept = state.kept.filter((x) => x.id !== id);
    updateCount();
    renderKept();
    done();
  }, 280));
  const error = await store.unkeep(id);
  if (error) return toast("Couldn't remove that");
  toast("Removed", { label: "Undo", run: async () => {
    await gone;
    if (state.kept.some((x) => x.id === id)) return;
    state.kept.splice(Math.min(at, state.kept.length), 0, r);
    updateCount();
    renderKept();
    const err = await store.rekeep(r);
    if (err) toast("Couldn't put that back");
    updateAcct();
  } });
  updateAcct();
}

// Keeps rows: swipe left to remove (with Undo), swipe right to celebrate (confetti). Vertical scrolling still works.
(() => {
  const list = $("#list");
  let drag = null, eatClick = false;
  const threshold = (item) => Math.min(110, item.offsetWidth * 0.3);
  const full = (item) => item.offsetWidth * 0.7;
  const paint = (d, dx) => {
    d.item.style.transform = `translateX(${dx}px)`;
    d.open.style.opacity = dx > 0 ? Math.min(1, dx / 60) : 0;
    d.del.style.opacity = dx < 0 ? Math.min(1, -dx / 60) : 0;
    d.row.classList.toggle("armed", Math.abs(dx) > threshold(d.item));
    d.row.classList.toggle("full", dx > full(d.item));
  };
  // While dragging right, sprinkle confetti out of the panel: the further you go, the more comes out.
  const sprinkle = (d) => {
    const now = performance.now();
    if (d.dx < 24 || now - (d.lastSprinkle || 0) < 55) return;
    d.lastSprinkle = now;
    const box = d.row.getBoundingClientRect();
    const amount = Math.min(10, Math.ceil(d.dx / 40));
    confetti(box.left + Math.min(d.dx, box.width) * 0.45, box.top + box.height * 0.5, amount, { power: 0.35 + Math.min(0.5, d.dx / box.width), size: 0.8 });
  };
  const settle = (d) => {
    d.item.classList.add("snapping");
    paint(d, 0);
    d.row.classList.remove("armed");
    setTimeout(() => d.item.classList.remove("snapping"), 320);
  };
  list.addEventListener("pointerdown", (e) => {
    const item = e.target.closest(".swipe-row > .item");
    if (!item || e.button > 0 || e.target.closest(".sh, .rm")) return;
    const row = item.parentElement;
    drag = { item, row, open: row.querySelector(".swipe-open"), del: row.querySelector(".swipe-del"), x: e.clientX, y: e.clientY, dx: 0, on: false, pid: e.pointerId };
  });
  list.addEventListener("pointermove", (e) => {
    const d = drag;
    if (!d || e.pointerId !== d.pid) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.on) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { drag = null; return; } // it's a scroll
      if (Math.abs(dx) < 10) return;
      d.on = true;
      d.item.classList.remove("snapping");
      try { d.item.setPointerCapture(e.pointerId); } catch { /* fine */ }
    }
    d.dx = dx;
    paint(d, dx);
    if (dx > 0) sprinkle(d);
  });
  const end = (e) => {
    const d = drag;
    drag = null;
    if (!d || !d.on) return;
    eatClick = true;
    setTimeout(() => { eatClick = false; }, 400);
    const th = threshold(d.item);
    if (e.type === "pointerup" && d.dx < -th) {
      d.item.classList.add("snapping");
      d.item.style.transform = "translateX(-110%)";
      d.del.style.opacity = 1;
      removeKeep(d.row);
      return;
    }
    if (e.type === "pointerup" && d.dx > th) {
      const box = d.row.getBoundingClientRect();
      const x = box.left + Math.min(d.dx, box.width) * 0.6, y = box.top + box.height / 2;
      if (d.dx > full(d.item)) {
        // All the way: explode. A huge burst from the row plus cannons from both bottom corners.
        confetti(x, y, 220, { power: 1.7 });
        confetti(0, window.innerHeight, 110, { power: 1.6, aim: -Math.PI / 3, spread: 0.6 });
        confetti(window.innerWidth, window.innerHeight, 110, { power: 1.6, aim: -2 * Math.PI / 3, spread: 0.6 });
        buzz([20, 40, 30, 40, 60]);
      } else {
        confetti(x, y, 160, { power: 1.15 });
        buzz([12, 50, 18]);
      }
    }
    d.row.classList.remove("full");
    settle(d);
  };
  list.addEventListener("pointerup", end);
  list.addEventListener("pointercancel", end);
  // Links and images would start a native drag and steal the gesture.
  list.addEventListener("dragstart", (e) => { if (e.target.closest(".swipe-row")) e.preventDefault(); });
  // A swipe is not a tap: don't follow the recipe link after one.
  list.addEventListener("click", (e) => { if (eatClick) { e.preventDefault(); e.stopPropagation(); } }, true);
})();

// Confetti: paper bits from (x, y) that shoot out, spin and fall with gravity. All bursts share one layer.
// power scales speed, aim is the direction in radians (default straight up), spread is the fan width (1 = 180°).
let confettiLayer = null, confettiLive = 0;
function confetti(x, y, n = 90, { power = 1, aim = -Math.PI / 2, spread = 1.1, size = 1 } = {}) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (!confettiLayer) {
    confettiLayer = document.createElement("div");
    confettiLayer.className = "confetti";
    document.body.append(confettiLayer);
  }
  const colors = ["#e8553e", "#3f9b6b", "#e9a23b", "#f3c3b8", "#6f8fd8", "#f7f1e8", "#c77dbd"];
  const fall = window.innerHeight - y + 120;
  for (let i = 0; i < n; i++) {
    const bit = document.createElement("i");
    const w = (6 + Math.random() * 6) * size, h = Math.random() < 0.3 ? w : w * (0.4 + Math.random() * 0.4);
    bit.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px;background:${colors[(Math.random() * colors.length) | 0]};border-radius:${Math.random() < 0.25 ? "50%" : "2px"}`;
    confettiLayer.append(bit);
    confettiLive++;
    const a = aim + (Math.random() - 0.5) * Math.PI * spread;
    const v = (160 + Math.random() * 280) * power;
    const dx = Math.cos(a) * v, up = Math.sin(a) * v; // up is negative
    const drift = (Math.random() - 0.5) * 140, spin = (Math.random() - 0.5) * 1440, flip = Math.random() * 720;
    const dur = (1300 + Math.random() * 1000) * (0.8 + power * 0.25);
    bit.animate([
      { transform: "translate(-50%, -50%) rotate(0deg) rotateX(0deg)", opacity: 1 },
      { transform: `translate(calc(-50% + ${dx * 0.8}px), calc(-50% + ${up}px)) rotate(${spin * 0.35}deg) rotateX(${flip * 0.35}deg)`, opacity: 1, offset: 0.3, easing: "cubic-bezier(.3,.6,.6,1)" },
      { transform: `translate(calc(-50% + ${dx + drift}px), calc(-50% + ${fall}px)) rotate(${spin}deg) rotateX(${flip}deg)`, opacity: 0.9, easing: "cubic-bezier(.5,0,.9,.6)" },
    ], { duration: dur, delay: Math.random() * 80, fill: "forwards" }).finished.then(() => {
      bit.remove();
      if (--confettiLive === 0 && confettiLayer) { confettiLayer.remove(); confettiLayer = null; }
    }, () => {});
  }
}

// First time on Keeps with something kept: the top row peeks right (Open) then left (Remove), once.
function maybeHintKeepSwipe() {
  if (ls.get("forks:keepSwipeHint", false) || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const row = $("#list .swipe-row");
  if (!row || $("#view-kept").offsetParent === null) return;
  ls.set("forks:keepSwipeHint", true);
  const item = row.querySelector(".item"), open = row.querySelector(".swipe-open"), del = row.querySelector(".swipe-del");
  const opts = { duration: 1600, delay: 500, easing: "cubic-bezier(.45,0,.25,1)" };
  item.animate([
    { transform: "translateX(0)" }, { transform: "translateX(64px)", offset: 0.25 }, { transform: "translateX(64px)", offset: 0.4 },
    { transform: "translateX(-64px)", offset: 0.65 }, { transform: "translateX(-64px)", offset: 0.8 }, { transform: "translateX(0)" },
  ], opts);
  open.animate([{ opacity: 0 }, { opacity: 1, offset: 0.25 }, { opacity: 1, offset: 0.4 }, { opacity: 0, offset: 0.5 }, { opacity: 0 }], opts);
  del.animate([{ opacity: 0 }, { opacity: 0, offset: 0.5 }, { opacity: 1, offset: 0.65 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], opts);
}
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
document.querySelectorAll(".sheet-x").forEach((b) => { b.innerHTML = icon("x"); });
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
    text = `You kept ${kept.length} of your last ${BREAK_EVERY}. We see you, keeper.`;
  } else if (kept.length) {
    [ic, title] = pick([["party-popper", "Twenty down"], ["sparkles", "Nice haul"], ["chef-hat", "Look at you go"]]);
    text = `${kept.length} new keep${kept.length > 1 ? "s" : ""} from your last ${BREAK_EVERY} swipes.`;
  } else {
    [ic, title] = pick([["frown", "Tough crowd"], ["search", "Picky, picky"]]);
    text = `Nothing grabbed you in the last ${BREAK_EVERY}. Maybe try another type of recipe?`;
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
    $("#saveText").textContent = `You have ${keeps} keep${keeps === 1 ? "" : "s"} so far. Add your email and we'll save them.`;
    $("#saveGo").textContent = "Save my keeps";
    $("#saveSkip").textContent = "No thanks, just browsing";
  } else if (mode === "manual") {
    $("#saveIcon").innerHTML = icon(keeps ? "bookmark" : "mail");
    $("#saveTitle").textContent = keeps ? "Save your keeps" : "Sign in";
    $("#saveText").textContent = keeps
      ? `Your ${keeps} keep${keeps === 1 ? " lives" : "s live"} on this device for now. Add your email to save ${keeps === 1 ? "it" : "them"} anywhere.`
      : "Enter your email and we'll send a magic link.";
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
    $("#saveText").textContent = `${email} already has an account, so we sent you a magic link to sign in.${keeps ? " Today's keeps save to your account once you tap that link." : ""}`;
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
  $("#acctText").textContent = "Your keeps are saved to your account.";
  $("#acctShare").innerHTML = icon("share");
  $("#acctCopy").innerHTML = icon("copy");
  $("#acctCopy").hidden = !state.me?.share_code;
  $("#acctShareUrl").textContent = state.me?.share_code ? `forkslist.com/${state.me.share_code}` : "Add your first name to get your link";
  loadFollowers(true);
  loadSundayPref();
  openSheet("#acct");
});

// Sunday Dinner Pick email: on unless you've turned it off (no prefs row = on).
async function loadSundayPref() {
  const sw = $("#acctSunday");
  if (!state.user) return;
  const { data, error } = await db.from("meals_email_prefs").select("sunday_pick").eq("user_id", state.user.id).maybeSingle();
  if (!error) sw.checked = data ? data.sunday_pick !== false : true;
}
// "See preview": your own email for this week, rendered by the sender but not sent.
$("#acctSundayPreview").addEventListener("click", async (e) => {
  e.preventDefault(); e.stopPropagation();
  const frame = $("#mailPrevFrame"), msg = $("#mailPrevMsg");
  frame.srcdoc = ""; frame.hidden = false; msg.hidden = true;
  openSheet("#mailPrev");
  const fail = (t) => { frame.hidden = true; msg.hidden = false; msg.textContent = t; };
  try {
    const { data } = await db.auth.getSession();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/meals-sunday`, {
      method: "POST",
      headers: { Authorization: `Bearer ${data.session?.access_token}`, apikey: SUPABASE_ANON, "content-type": "application/json" },
      body: JSON.stringify({ preview: true }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return fail("Couldn't load the preview. Try again in a minute.");
    if (!j.html) return fail("Keep a few dinners and your first pick will show up here.");
    // Links open in a new tab, not inside the preview.
    frame.srcdoc = j.html.replace("<head>", '<head><base target="_blank">');
  } catch { fail("Couldn't load the preview. Try again in a minute."); }
});
$("#mailPrevDone").addEventListener("click", () => closeSheet("#mailPrev"));
$("#mailPrev").addEventListener("click", (e) => { if (e.target.id === "mailPrev") closeSheet("#mailPrev"); });
$("#acctSunday").addEventListener("change", async (e) => {
  const sw = e.target, on = sw.checked;
  sw.disabled = true;
  const { error } = await db.rpc("meals_set_sunday_pick", { p_on: on });
  sw.disabled = false;
  if (error) { sw.checked = !on; return toast("Couldn't save that. Try again?"); }
  toast(on ? "Sunday Dinner Pick email is on" : "Sunday Dinner Pick email is off");
});

// Followers: newest first, 10 at a time, with a Follow back button. Only you see who follows you.
const followers = { rows: [], total: 0, loading: false };
async function loadFollowers(reset) {
  if (!state.user || followers.loading) return;
  followers.loading = true;
  if (reset) {
    followers.rows = [];
    $("#acctFollowerTotal").textContent = "";
    $("#acctFollowerList").innerHTML = `<li class="fl-empty">Loading…</li>`;
    $("#acctFollowerMore").hidden = true;
  }
  const { data, error } = await db.rpc("meals_my_followers", { p_offset: followers.rows.length, p_limit: 10 });
  followers.loading = false;
  if (error) {
    console.error(error);
    if (reset) $("#acctFollowerList").innerHTML = `<li class="fl-empty">Couldn't load your followers. Try again in a minute.</li>`;
    return;
  }
  if (data?.length) followers.total = Number(data[0].total);
  else if (reset) followers.total = 0;
  followers.rows.push(...(data || []));
  renderFollowers();
}
const shortDate = (d) => new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
function renderFollowers() {
  const n = followers.total;
  $("#acctFollowerTotal").textContent = n ? `${n}` : "";
  $("#acctFollowerList").innerHTML = followers.rows.length
    ? followers.rows.map((f) => {
      const on = state.follows.has(f.user_id);
      const name = f.name || "Someone";
      return `
      <li>
        ${avatar(name, "sm", f.color)}
        <span class="fl-who"><b>${esc(name)}</b><small>Followed you ${esc(shortDate(f.followed_at))}</small></span>
        <button class="follow sm ${on ? "is-on" : ""}" type="button" data-uid="${esc(f.user_id)}" data-name="${esc(name)}" aria-pressed="${on}">${icon(on ? "user-check" : "user-plus")}<span>${on ? "Following" : "Follow back"}</span></button>
      </li>`;
    }).join("")
    : `<li class="fl-empty">No followers yet. Share your link and they'll show up here.</li>`;
  $("#acctFollowerMore").hidden = followers.rows.length >= n;
  $("#acctFollowerMore").textContent = `Show more (${n - followers.rows.length})`;
}
$("#acctFollowerList").addEventListener("click", async (e) => {
  const b = e.target.closest("button[data-uid]");
  if (!b) return;
  const on = !state.follows.has(b.dataset.uid);
  b.disabled = true;
  await setFollow(b.dataset.uid, on);
  renderFollowers();
  toast(on ? `Following ${b.dataset.name}` : `Unfollowed ${b.dataset.name}`);
});
$("#acctFollowerMore").addEventListener("click", () => loadFollowers(false));
// Share your keeps: an unlisted link anyone can open to see and follow your list.
const myLink = () => `${location.origin}/${state.me.share_code}`;
function needName() {
  if (state.me?.share_code) return false;
  if (state.user) ls.del(`forks:nameLater:${state.user.id}`);
  closeSheet("#acct", askName);
  return true;
}
$("#acctShare").addEventListener("click", async () => {
  if (needName()) return;
  try {
    if (navigator.share) { await navigator.share({ title: `${state.me.name}'s keeps on forks.`, text: `${state.me.name}'s keeps on forks. Swipe right on dinner.`, url: myLink() }); return; }
  } catch (err) { if (err?.name === "AbortError") return; }
  $("#acctCopy").click();
});
$("#acctCopy").addEventListener("click", async () => {
  if (needName()) return;
  try { await navigator.clipboard.writeText(myLink()); }
  catch { return prompt("Copy this link", myLink()); }
  const b = $("#acctCopy");
  b.innerHTML = icon("check");
  b.classList.add("done");
  toast("Link copied");
  clearTimeout(b._t);
  b._t = setTimeout(() => { b.innerHTML = icon("copy"); b.classList.remove("done"); }, 1600);
});
$("#topShare").addEventListener("click", async () => {
  if (!state.user) return openSave("manual");
  if (!state.me?.share_code) { ls.del(`forks:nameLater:${state.user.id}`); return askName(); }
  try {
    if (navigator.share) { await navigator.share({ title: `${state.me.name}'s keeps on forks.`, text: `${state.me.name}'s keeps on forks. Swipe right on dinner.`, url: myLink() }); return; }
  } catch (err) { if (err?.name === "AbortError") return; }
  try { await navigator.clipboard.writeText(myLink()); toast("Link copied"); }
  catch { prompt("Copy this link", myLink()); }
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
  // Desktop header pill: "Share my keeps" when signed in, "Save your keeps" for guests.
  $("#topShareIc").innerHTML = icon(state.user ? "share" : "bookmark");
  $("#topShareText").textContent = state.user ? "Share my keeps" : "Save your keeps";
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
  const { data } = await db.rpc("meals_people_v2", { p_ids: state.user ? [] : [...state.follows] });
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
  updateAcct(); // the header avatar needs the profile, which only arrives here
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
  const [{ data }, { data: fc }] = await Promise.all([
    db.rpc("meals_public_keeps", { p_handle: handle }),
    db.rpc("meals_follower_count", { p_handle: handle }),
  ]);
  peopleList = (data || []).filter((r) => !JUNK.test(r.title)).map(clean);
  peopleHandle = handle;
  peopleFollowers = Number(fc) || 0;
  $("#peopleAvatar").outerHTML = avatar(peopleProfile.name, "", peopleProfile.color).replace('class="avatar ', 'id="peopleAvatar" class="avatar ');
  $("#peopleName").textContent = `${peopleProfile.name}'s keeps`;
  renderPeopleCount();
  renderPeople();
  openSheet("#people");
}
let peopleHandle = null, peopleFollowers = 0;
function renderPeopleCount() {
  const r = peopleList.length, f = peopleFollowers;
  $("#peopleCount").textContent = `${r} keep${r === 1 ? "" : "s"} · ${f} follower${f === 1 ? "" : "s"}`;
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
  // Signed-in follows count toward the total (guest follows live on the device only), so refresh it.
  if (state.user && peopleHandle) {
    const { data: fc } = await db.rpc("meals_follower_count", { p_handle: peopleHandle });
    peopleFollowers = Number(fc) || 0;
    renderPeopleCount();
  }
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
let ogIds = null, ogSet = null;
const warmPreviews = () => (ogIds ??= fetch("/og/index.json").then((r) => (r.ok ? r.json() : [])).then((a) => (ogSet = new Set(a))).catch(() => (ogSet = new Set())));
async function hasPreview(id) { return (await warmPreviews()).has(id); }
async function shareRecipe(r) {
  if (!r) return;
  // Only wait if the preview list hasn't loaded yet; otherwise the share sheet opens straight from the tap.
  if (!ogSet) await warmPreviews();
  const by = state.me?.share_code ? encodeURIComponent(state.me.share_code) : "";
  const url = ogSet.has(r.id)
    ? `${location.origin}/s/${r.id}/${by ? `?by=${by}` : ""}`
    : `${location.origin}/?r=${r.id}${by ? `&by=${by}` : ""}`;
  const text = `${r.title}. Found it on forks.`;
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
  // Least-used brand color (from the server), so new people rarely share a color. Kept on save.
  pickedColor = BRAND[Math.floor(Math.random() * BRAND.length)];
  db.rpc("meals_suggest_color").then(({ data }) => {
    if (BRAND.includes(data)) { pickedColor = data; previewKey = null; previewName(); }
  });
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

// ---------- search toggle ----------
function toggleSearch(open = !state.searchOpen) {
  state.searchOpen = open;
  if (!open) { state.query = ""; $("#search").value = ""; }
  $("#searchToggle").classList.toggle("is-on", open);
  $("#searchToggle").setAttribute("aria-expanded", open);
  renderKept();
  if (open) setTimeout(() => $("#search").focus(), 30);
}
$("#searchToggle").addEventListener("click", () => toggleSearch());

// ---------- tabs & keys ----------
function show(view) {
  document.querySelectorAll(".tab").forEach((t) => {
    const on = t.dataset.view === view;
    t.classList.toggle("is-active", on);
    t.setAttribute("aria-selected", on);
  });
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("is-active", v.id === `view-${view}`));
  ls.set("forks:view", view);
  if (view === "kept") requestAnimationFrame(maybeHintKeepSwipe);
}
document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => show(t.dataset.view)));
$("#logoBtn").addEventListener("click", () => { show("swipe"); window.scrollTo({ top: 0, behavior: "smooth" }); });

$("#btnLike").addEventListener("click", () => swipe(true));
$("#btnNope").addEventListener("click", () => swipe(false));
$("#btnUndo").addEventListener("click", undo);

document.addEventListener("keydown", (e) => {
  if (!$("#together").hidden) {
    if (e.key === "Escape") return closeTogether();
    if (e.target.matches("input")) return;
    if (e.key === "ArrowRight" && $("#tgDeck")) { e.preventDefault(); tgThrow(true); }
    else if (e.key === "ArrowLeft" && $("#tgDeck")) { e.preventDefault(); tgThrow(false); }
    return;
  }
  if (!$("#mailPrev").hidden) { if (e.key === "Escape") closeSheet("#mailPrev"); return; }
  if (!$("#break").hidden) { if (e.key === "Escape") $("#breakGo").click(); return; }
  if (!$("#save").hidden) { if (e.key === "Escape") skipSave(); return; }
  if (!$("#acct").hidden) { if (e.key === "Escape") closeSheet("#acct"); return; }
  if (!$("#people").hidden) { if (e.key === "Escape") closeSheet("#people"); return; }
  if (!$("#landing").hidden) { if (e.key === "Escape" || e.key === "Enter") $("#landGo").click(); return; }
  if (!$("#nameSheet").hidden) { if (e.key === "Escape") closeSheet("#nameSheet"); return; }
  if (e.target.matches("input")) {
    if (e.key === "Escape") { if (e.target.id === "search" && !e.target.value) toggleSearch(false); e.target.blur(); }
    return;
  }
  if (!$("#view-swipe").classList.contains("is-active")) {
    if (e.key === "/") { e.preventDefault(); toggleSearch(true); }
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
document.querySelectorAll(".of-heart").forEach((h) => (h.innerHTML = icon("heart")));
$("#searchToggle").innerHTML = icon("search");

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

// ---------- Swipe with someone ----------
// One person starts a round of 12 dinners and sends the link. Everyone swipes the same 12 (no account
// needed), then sees the dinners they all kept. Keeps from a round also land in your own keeps.
const TG_NAME = "forks:tgName", TG_ACTIVE = "forks:tgActive";
const tg = { code: null, pid: null, data: null, poll: null, busy: false };
const tgPid = (code) => {
  let id = ls.get(`forks:tg:${code}`, null);
  if (!id) { id = crypto.randomUUID(); ls.set(`forks:tg:${code}`, id); }
  return id;
};
const tgName = () => state.me?.name || ls.get(TG_NAME, "");
const tgLink = () => `${location.origin}/?with=${tg.code}`;
const tgBody = (html) => { $("#tgBody").innerHTML = html; };
const tgOthers = () => (tg.data?.people || []).filter((p) => !p.me);
// "Kelly's", but "James'".
const poss = (n) => (/s$/i.test(n) ? `${n}'` : `${n}'s`);
const tgKeptCount = () => Object.values(tg.data?.mine || {}).filter(Boolean).length;
// Signed in with a name: never ask for it.
const tgKnownName = () => (state.user && state.me?.name) || "";
const tgMine = () => Object.keys(tg.data?.mine || {}).length;

$("#withIc").innerHTML = icon("users");
$("#withBtn").addEventListener("click", () => {
  const active = ls.get(TG_ACTIVE, null);
  if (active) return openTogether(active, { resume: true });
  tg.code = null; tg.data = null;
  tgIntro();
  openSheet("#together");
});
$("#tgClose").addEventListener("click", closeTogether);
$("#together").addEventListener("click", (e) => { if (e.target.id === "together") closeTogether(); });
function closeTogether() { clearInterval(tg.poll); tg.poll = null; closeSheet("#together"); }

// Start screen (host) or invite screen (someone who opened the link).
function tgIntro() {
  const guest = !!tg.data && !tg.data.is_host;
  const name = tgName(), known = tgKnownName();
  tgBody(`
    <div class="tg-icon">${icon("users")}</div>
    <h3 id="tgTitle">${guest ? `${esc(tg.data.host_name)} wants to pick dinner with you` : "Swipe with someone"}</h3>
    <p class="tg-lead">${guest ? "Swipe 12 dinners. We'll show you the ones you both want." : "You both swipe the same 12 dinners. We'll show you the ones you both want."}</p>
    <form class="tg-form" id="tgForm" novalidate>
      ${known ? "" : `<input class="tg-name" id="tgName" type="text" autocomplete="given-name" maxlength="24" placeholder="Your first name" value="${esc(name)}" ${name ? "" : "autofocus"} aria-label="Your first name" />`}
      <button class="btn tg-go" type="submit">${guest ? "Start swiping" : "Start a round"}</button>
    </form>`);
  $("#tgForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const n = known || $("#tgName").value.trim();
    if (!n) { $("#tgName").focus(); return toast("Add your first name so they know it's you"); }
    if (!known) ls.set(TG_NAME, n);
    if (guest) return tgSwipe();
    const btn = e.submitter || $(".tg-go");
    btn.disabled = true; btn.textContent = "Setting the table…";
    const pid = crypto.randomUUID();
    const { data: code, error } = await db.rpc("meals_together_create", { p_participant: pid, p_name: n });
    if (error || !code) { btn.disabled = false; btn.textContent = "Start a round"; return toast("Couldn't start a round. Try again?"); }
    ls.set(`forks:tg:${code}`, pid);
    ls.set(TG_ACTIVE, code);
    await openTogether(code, { fresh: true });
  });
}

async function tgFetch() {
  const { data, error } = await db.rpc("meals_together_get", { p_code: tg.code, p_participant: tg.pid });
  if (error) { console.error(error); return null; }
  return data;
}

async function openTogether(code, { fresh = false, resume = false } = {}) {
  tg.code = code; tg.pid = tgPid(code);
  if ($("#together").hidden) { tgBody(`<div class="tg-wait"><div class="spinner"></div></div>`); openSheet("#together"); }
  const data = await tgFetch();
  if (!data) {
    if (ls.get(TG_ACTIVE, null) === code) ls.del(TG_ACTIVE);
    if (resume) { tg.code = null; tg.data = null; return tgIntro(); }
    closeTogether();
    return toast("That round has ended. Start your own!");
  }
  tg.data = data;
  if (!data.is_host && !tgMine()) return tgIntro();
  if (data.is_host && fresh) return tgInvite();
  tgNext();
}

// Host, right after starting: send the link first (it's the point), then swipe.
function tgInvite() {
  tgBody(`
    <div class="tg-icon">${icon("share")}</div>
    <h3 id="tgTitle">Send the link</h3>
    <p class="tg-lead">Whoever opens it swipes the same 12 recipes.<br>No account required.</p>
    <div class="share-link tg-link"><span class="sl-text"><b>Your round</b><small>${esc(tgLink().replace(/^https?:\/\//, ""))}</small></span>
      <button class="sl-ic ghost" id="tgCopy" type="button" aria-label="Copy link">${icon("copy")}</button>
      <button class="sl-ic" id="tgShare" type="button" aria-label="Share link">${icon("share")}</button></div>
    <button class="btn tg-go" id="tgStart" type="button">Start my 12</button>`);
  $("#tgShare").addEventListener("click", tgShareLink);
  $("#tgCopy").addEventListener("click", tgCopyLink);
  $("#tgStart").addEventListener("click", tgSwipe);
}
async function tgShareLink() {
  const text = `Help me pick dinner? Swipe 12 on forks and we'll see which ones we both want.`;
  try { if (navigator.share) { await navigator.share({ title: "Swipe dinner with me", text, url: tgLink() }); return; } }
  catch (err) { if (err?.name === "AbortError") return; }
  tgCopyLink();
}
async function tgCopyLink() {
  try { await navigator.clipboard.writeText(tgLink()); toast("Link copied"); }
  catch { prompt("Copy this link", tgLink()); }
}

function tgSwipe() { tgNext(); }

// The round's card area works like the main deck: same cards, loader, fanned stack, drag, stamp slam.
const tgQueue = () => (tg.data?.recipes || []).filter((x) => !(x.id in (tg.data.mine || {})));
function tgNext() {
  clearInterval(tg.poll); tg.poll = null;
  if (!tgQueue().length) return tgDone();
  tgBody(`
    <div class="tg-top"><b id="tgTitle"></b></div>
    <div class="tg-bar"><i></i></div>
    <div class="deck tg-deck" id="tgDeck"></div>
    <div class="tg-acts">
      <button class="act act-nope" id="tgNope" aria-label="Nope" title="Nope (←)">${icon("x")}</button>
      <button class="act act-like" id="tgLike" aria-label="Keep" title="Keep (→)">${icon("heart")}</button>
    </div>
    <div class="tg-status" id="tgStatus"></div>`);
  tgStatus();
  tg.poll = setInterval(async () => {
    if ($("#together").hidden || !$("#tgDeck")) { clearInterval(tg.poll); tg.poll = null; return; }
    const d2 = await tgFetch();
    if (!d2 || !$("#tgDeck")) return;
    // Keep my own swipes from this device (they may be newer than the server's copy).
    tg.data = { ...d2, mine: { ...d2.mine, ...tg.data.mine } };
    tgStatus();
  }, 5000);
  $("#tgNope").addEventListener("click", (e) => tgThrow(false, e));
  $("#tgLike").addEventListener("click", (e) => tgThrow(true, e));
  tgRender();
}
function tgStatus() {
  const box = $("#tgStatus"); if (!box) return;
  const d = tg.data;
  const done = tgOthers().filter((p) => p.n >= d.total).map((p) => p.name);
  if (done.length) {
    const names = done.length === 1 ? poss(done[0]) : `${done.slice(0, -1).map(poss).join(", ")} and ${poss(done.at(-1))}`;
    box.innerHTML = `<p class="tg-in">${icon("check")}${esc(names)} picks are in.</p>`;
  } else {
    box.innerHTML = `<button class="tg-again" id="tgInvite" type="button">${icon("user-plus")}Invite someone</button>`;
    $("#tgInvite").addEventListener("click", tgShareLink);
  }
}
const tgDeckEl = () => $("#tgDeck");
const tgTop = () => [...(tgDeckEl()?.querySelectorAll(".card:not(.gone)") || [])].pop();
function tgRestack() {
  const deck = tgDeckEl(); if (!deck) return;
  const holding = deck.querySelectorAll(".card.gone.holding").length;
  [...deck.querySelectorAll(".card:not(.gone)")].reverse().forEach((c, i) => { c.dataset.depth = Math.min(i + holding, 5); });
}
let tgSide = "r";
function tgRender() {
  const deck = tgDeckEl(); if (!deck) return;
  const q = tgQueue(), d = tg.data;
  const n = d.total - q.length + 1;
  $("#tgTitle").textContent = `${Math.min(n, d.total)} of ${d.total}`;
  $(".tg-bar i").style.width = `${((n - 1) / d.total) * 100}%`;
  // Top 3 unswiped, top card last in the DOM. New ones go underneath; existing ones are never moved.
  const want = q.slice(0, 3).reverse();
  const have = new Map([...deck.querySelectorAll(".card:not(.gone)")].map((el) => [el.dataset.id, el]));
  want.forEach((r) => {
    if (have.has(r.id)) return;
    const rr = clean(r);
    const el = document.createElement("article");
    el.className = "card deal";
    el.addEventListener("animationend", (e) => { if (e.animationName === "deal") el.classList.remove("deal"); });
    el.dataset.id = r.id;
    el.dataset.side = (tgSide = tgSide === "l" ? "r" : "l");
    el.innerHTML = cardHTML(rr);
    const img = el.querySelector("img");
    if (!img.complete) {
      el.classList.add("loading");
      const shown = () => el.classList.remove("loading");
      img.addEventListener("load", shown, { once: true });
      img.addEventListener("error", shown, { once: true });
    }
    img.onerror = () => img.remove();
    const firstLive = deck.querySelector(".card:not(.gone)");
    firstLive ? firstLive.before(el) : deck.appendChild(el);
  });
  q.slice(3, 5).forEach((r) => preload(clean(r).image));
  tgRestack();
  const top = tgTop();
  if (top) tgDrag(top);
}
function tgDrag(el) {
  if (el._bound) return;
  el._bound = true;
  let sx = 0, sy = 0, dx = 0, dy = 0, down = false;
  const like = el.querySelector(".stamp-like"), nope = el.querySelector(".stamp-nope");
  el.addEventListener("pointerdown", (e) => {
    if (el !== tgTop() || tg.busy) return;
    down = true; sx = e.clientX; sy = e.clientY; dx = dy = 0;
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
    el._fling = { dx, dy: dy * 0.4 };
    if (dx > threshold) tgThrow(true, e);
    else if (dx < -threshold) tgThrow(false, e);
    else { el.style.transform = ""; like.style.opacity = nope.style.opacity = 0; }
  };
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
}

function tgThrow(liked, evt) {
  const el = tgTop();
  const r = tgQueue()[0];
  if (!el || !r || tg.busy) return;
  el.classList.add("gone", "holding");
  const stamp = el.querySelector(liked ? ".stamp-like" : ".stamp-nope");
  const s = liked ? 1 : -1;
  const last = tgQueue().length === 1;
  const drop = () => { el.remove(); tgRestack(); if (last) tgDone(); };
  stampSlam(el, stamp, s, evt?.pointerType && el._fling ? el._fling : null, tgRestack).then(drop, drop);
  const btn = liked ? $("#tgLike") : $("#tgNope");
  btn.classList.remove("pulse"); void btn.offsetWidth; btn.classList.add("pulse");
  if (liked) {
    const rect = btn.getBoundingClientRect();
    hearts(evt?.clientX ?? rect.left + rect.width / 2, evt?.clientY ?? rect.top);
  }
  tg.data.mine = { ...tg.data.mine, [r.id]: liked };
  tgRender();
  // Votes go one at a time, so the reveal never checks before your last one lands.
  tg.pending = (tg.pending || Promise.resolve()).then(() => tgVote(r, liked));
}

async function tgVote(r, liked) {
  const name = tgName() || "Someone";
  const { data: ok, error } = await db.rpc("meals_together_vote", { p_code: tg.code, p_participant: tg.pid, p_name: name, p_recipe: r.id, p_liked: liked });
  if (error || !ok) {
    // Put it back so it can be swiped again.
    const mine = { ...tg.data.mine }; delete mine[r.id]; tg.data.mine = mine;
    toast("Couldn't save that one. Try again?");
    if (tgDeckEl()) tgRender(); else tgNext();
    return;
  }
  if (liked) {
    // Your keeps from a round are real keeps.
    const rr = clean(r);
    if (!state.kept.some((k) => k.id === rr.id)) { state.kept = [{ ...rr, swiped_at: new Date().toISOString() }, ...state.kept]; updateCount(true); renderKept(); }
    store.swipe(rr, true);
  }
}

async function tgDone() {
  await tg.pending;
  if (tgQueue().length) return tgNext(); // a vote failed and went back in the stack
  const fresh = await tgFetch();
  if (fresh) tg.data = fresh;
  const d = tg.data;
  if (d.done >= 2) return tgReveal();
  const others = tgOthers();
  const waitingOn = others.length ? others.map((p) => esc(p.name)).join(" and ") : null;
  tgBody(`
    <div class="tg-icon tg-pulse">${icon("users")}</div>
    <h3 id="tgTitle">Your 12 are in</h3>
    <p class="tg-lead">${waitingOn
      ? `Waiting on ${waitingOn} (${others.map((p) => `${p.n} of ${d.total}`).join(", ")}). Your matches show up here when they finish.`
      : "Now send the link. Your matches show up here as soon as someone finishes their 12."}</p>
    <div class="share-link tg-link"><span class="sl-text"><b>Your round</b><small>${esc(tgLink().replace(/^https?:\/\//, ""))}</small></span>
      <button class="sl-ic ghost" id="tgCopy" type="button" aria-label="Copy link">${icon("copy")}</button>
      <button class="sl-ic" id="tgShare" type="button" aria-label="Share link">${icon("share")}</button></div>
    ${state.user ? `<p class="tg-foot">Your keeps from this round are saved to your account.</p>` : `<p class="tg-foot">Your keeps from this round are in Keeps on this device.</p>`}`);
  $("#tgShare").addEventListener("click", tgShareLink);
  $("#tgCopy").addEventListener("click", tgCopyLink);
  clearInterval(tg.poll);
  tg.poll = setInterval(async () => {
    if ($("#together").hidden) { clearInterval(tg.poll); tg.poll = null; return; }
    const d2 = await tgFetch();
    if (!d2) return;
    const changed = JSON.stringify(d2.people) !== JSON.stringify(tg.data.people);
    tg.data = d2;
    if (d2.done >= 2) { clearInterval(tg.poll); tg.poll = null; tgReveal(); }
    else if (changed) tgDone();
  }, 4000);
}

// Every right swipe in a round is a keep. Signed in: already on your account. Guest: on this device until they sign up.
function tgSaveBlock() {
  const k = tgKeptCount();
  if (!k) return "";
  const what = `${k === 1 ? "your keep" : `all ${k} of your keeps`}`;
  return state.user
    ? `<p class="tg-foot">${k === 1 ? "Your keep is" : `All ${k} of your keeps are`} saved to your account.</p>`
    : `<button class="btn tg-go" id="tgSave" type="button">Save ${what} to an account</button>`;
}
function tgReveal() {
  const d = tg.data;
  const finished = (d.people || []).filter((p) => !p.me && p.n >= d.total).map((p) => p.name);
  const who = finished.length ? `You and ${finished.length === 1 ? esc(finished[0]) : `${finished.slice(0, -1).map(esc).join(", ")} and ${esc(finished.at(-1))}`}` : "You";
  const byId = new Map((d.recipes || []).map((r) => [r.id, clean(r)]));
  const matches = (d.matches || []).map((id) => byId.get(id)).filter(Boolean);
  if (ls.get(TG_ACTIVE, null) === tg.code) ls.del(TG_ACTIVE);
  if (!matches.length) {
    tgBody(`
      <div class="tg-icon">${icon("frown")}</div>
      <h3 id="tgTitle">No overlap this time</h3>
      <p class="tg-lead">${who} didn't keep any of the same dinners. Another round?</p>
      ${tgSaveBlock()}
      <button class="${state.user || !tgKeptCount() ? "btn tg-go" : "break-stop"}" id="tgAgain" type="button">Start another round</button>`);
  } else {
    tgBody(`
      <p class="tg-kicker">It's a match</p>
      <h3 id="tgTitle">${who} ${finished.length > 1 ? "all" : "both"} want${matches.length === 1 ? " this" : ` these ${matches.length}`}</h3>
      <ul class="tg-matches">${matches.map((r) => `
        <li><a href="${esc(r.url)}" target="_blank" rel="noopener"><img src="${esc(r.image)}" alt="" referrerpolicy="no-referrer" /><span><b>${esc(r.title)}</b><small>${esc(r.source)}</small></span>${icon("arrow-up-right")}</a></li>`).join("")}</ul>
      ${tgSaveBlock()}
      <button class="break-stop" id="tgAgain" type="button">Start another round</button>`);
    const box = $(".tg-sheet").getBoundingClientRect();
    setTimeout(() => confetti(box.left + box.width / 2, box.top + 70, 60, { power: 0.7, size: 0.85 }), 120);
  }
  $("#tgAgain")?.addEventListener("click", () => { tg.code = null; tg.data = null; tgIntro(); });
  $("#tgSave")?.addEventListener("click", () => { closeSheet("#together", () => openSave("manual")); });
}

(async () => {
  // Arriving from a magic link?
  const params = new URLSearchParams(location.search);
  const hash = params.get("login");
  const shared = params.get("r"), sharedBy = params.get("by"), sharedUser = params.get("u");
  // Links from the Sunday email: ?unsub=<token>, ?follow=<user id>, ?view=followers
  const isId = (v) => /^[0-9a-f-]{36}$/i.test(v || "");
  const unsub = params.get("unsub"), followId = params.get("follow"), view = params.get("view");
  const withCode = params.get("with");
  if (isId(followId)) ls.set("forks:pendingFollow", followId);
  if (view === "followers") ls.set("forks:pendingView", "followers");
  if ((shared || sharedUser || unsub || followId || view || withCode) && !hash) history.replaceState(null, "", location.pathname);
  let merge = false;
  if (hash) {
    history.replaceState(null, "", location.pathname);
    const { error } = await db.auth.verifyOtp({ token_hash: hash, type: "magiclink" });
    if (error) { toast("That link has expired. Send yourself a fresh one."); setTimeout(() => openSave("manual"), 600); }
    else { merge = true; ls.del("forks:pendingEmail"); }
  }
  const { data } = await db.auth.getSession();
  await setUser(data.session?.user ?? null, { merge });
  if (withCode && /^[0-9a-f]{8}$/i.test(withCode)) openTogether(withCode.toLowerCase());
  if (isId(unsub)) {
    const { data: ok } = await db.rpc("meals_sunday_unsubscribe", { p_token: unsub });
    toast(ok ? "Sunday Dinner Pick email is off. Turn it back on anytime in your account." : "That link didn't work. You can turn it off in your account.");
  }
  const pendingFollow = ls.get("forks:pendingFollow", ""), pendingView = ls.get("forks:pendingView", "");
  if (!state.user && (isId(pendingFollow) || pendingView)) {
    // Sign in first; the follow / followers view is applied once you're back from the magic link.
    if (isId(followId) || view === "followers") setTimeout(() => openSave("manual"), 300);
  } else if (state.user && (isId(pendingFollow) || pendingView)) {
    ls.del("forks:pendingFollow"); ls.del("forks:pendingView");
    if (isId(pendingFollow) && pendingFollow !== state.user.id) {
      await setFollow(pendingFollow, true);
      const who = (state.people || []).find((p) => p.user_id === pendingFollow)?.name;
      toast(who ? `Following ${who}` : "Followed");
    }
    if (pendingView === "followers") setTimeout(() => { $("#acctBtn").click(); setTimeout(() => $("#acctFollowers").scrollIntoView({ block: "center", behavior: "smooth" }), 350); }, 300);
  } else if (state.user) setTimeout(askName, merge ? 1200 : 400);
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
