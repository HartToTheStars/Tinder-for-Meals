import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";

const SUPABASE_URL = "https://dmwsylofgfocmbqvmgfe.supabase.co";
// Public anon key (safe to ship; access is governed by RLS).
const SUPABASE_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtd3N5bG9mZ2ZvY21icXZtZ2ZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwMDg1NTMsImV4cCI6MjEwMDU4NDU1M30.Jxsz_HK6jE4y2T36RJMtRWpaXlk0ugyEL2b7CXTrgE8";
const db = createClient(SUPABASE_URL, SUPABASE_ANON);

const $ = (s) => document.querySelector(s);
const deckEl = $("#deck");
const deckMsg = $("#deckMsg");
const state = { deck: [], kept: [], history: [], query: "", source: "All", busy: false, dry: false, sinceRefine: 0 };
const REFINE_EVERY = 10;

// ---------- helpers ----------
const esc = (s = "") => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
let toastTimer;
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 1800);
}
function hearts(x, y) {
  const set = ["❤️", "🧡", "💛", "🍝", "🥗", "🍋"];
  for (let i = 0; i < 9; i++) {
    const h = document.createElement("span");
    h.className = "heart";
    h.textContent = set[i % set.length];
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
const preload = (src) => { const i = new Image(); i.referrerPolicy = "no-referrer"; i.src = src; };

// ---------- deck ----------
async function fetchDeck() {
  const exclude = new Set([...state.deck.map((r) => r.id), ...state.history.map((h) => h.recipe.id)]);
  const { data, error } = await db.rpc("meals_deck", { n: 20 });
  if (error) { console.error(error); return []; }
  return data.filter((r) => !exclude.has(r.id) && !JUNK.test(r.title)).map(clean);
}

async function refill() {
  if (state.busy) return;
  state.busy = true;
  const more = await fetchDeck();
  state.dry = more.length === 0;
  state.deck.unshift(...more); // new cards go underneath
  more.slice(-4).forEach((r) => preload(r.image));
  state.busy = false;
  render();
}

function cardHTML(r) {
  return `
    <img src="${esc(r.image)}" alt="" referrerpolicy="no-referrer" draggable="false" />
    <div class="stamp stamp-like"><span>KEEP</span></div>
    <div class="stamp stamp-nope"><span>NOPE</span></div>
    <div class="card-body">
      <span class="source">${esc(r.source)}</span>
      <h2>${esc(r.title)}</h2>
      ${r.description ? `<p>${esc(r.description)}</p>` : ""}
    </div>`;
}

function render() {
  const visible = state.deck.slice(-4);
  const existing = new Map([...deckEl.querySelectorAll(".card")].map((el) => [el.dataset.id, el]));
  const keep = new Set(visible.map((r) => r.id));
  existing.forEach((el, id) => { if (!keep.has(id) && !el.classList.contains("gone")) el.remove(); });

  // DOM order mirrors deck order: last child is the top card.
  visible.forEach((r) => {
    let el = existing.get(r.id);
    if (!el || el.classList.contains("gone")) {
      el = document.createElement("article");
      el.className = "card";
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
  $("#btnUndo").disabled = state.history.length === 0;

  if (!state.deck.length) {
    deckMsg.innerHTML = state.busy
      ? `<div class="spinner"></div><p>Setting the table…</p>`
      : `<div class="big">🧑‍🍳</div><h3>You've seen it all</h3><p>Want me to check the kitchens for new recipes?</p><button class="btn" id="btnHarvest">Find fresh recipes</button>`;
    deckMsg.hidden = false;
    $("#btnHarvest")?.addEventListener("click", harvest);
  } else deckMsg.hidden = true;

  if (state.deck.length < 5 && !state.dry && !state.busy) refill();
}

const topCard = () => [...deckEl.querySelectorAll(".card:not(.gone)")].pop();

// One-time intro: lean right (KEEP), then left (NOPE), then settle.
let taught = false;
function maybeTeach(el) {
  if (taught || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  taught = true;
  const like = el.querySelector(".stamp-like"), nope = el.querySelector(".stamp-nope");
  const ease = { easing: "cubic-bezier(.45,0,.25,1)", fill: "forwards" };
  const lean = (x, r) => `translate(${x}px, 0) rotate(${r}deg)`;
  const card = el.animate([
    { transform: lean(0, 0), offset: 0 },
    { transform: lean(36, 3), offset: 0.22 },
    { transform: lean(36, 3), offset: 0.38 },
    { transform: lean(-36, -3), offset: 0.62 },
    { transform: lean(-36, -3), offset: 0.78 },
    { transform: lean(0, 0), offset: 1 },
  ], { duration: 1800, delay: 500, ...ease });
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
  let sx = 0, sy = 0, dx = 0, dy = 0, down = false;
  const like = el.querySelector(".stamp-like"), nope = el.querySelector(".stamp-nope");

  el.addEventListener("pointerdown", (e) => {
    if (el !== topCard()) return;
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
    if (dx > threshold) swipe(true, e);
    else if (dx < -threshold) swipe(false, e);
    else if (Math.abs(dx) < 5 && Math.abs(dy) < 5) { /* tap: no-op */ el.style.transform = ""; }
    else { el.style.transform = ""; like.style.opacity = nope.style.opacity = 0; }
  };
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
}

async function swipe(liked, evt) {
  const el = topCard();
  const recipe = state.deck[state.deck.length - 1];
  if (!el || !recipe) return;

  el._stopTeach?.();
  el.classList.add("gone");
  el.querySelector(liked ? ".stamp-like" : ".stamp-nope").style.opacity = 1;
  const w = window.innerWidth;
  el.style.transform = `translate(${liked ? w : -w}px, ${-40}px) rotate(${liked ? 28 : -28}deg)`;
  el.style.opacity = "0";
  setTimeout(() => el.remove(), 380);

  state.deck.pop();
  state.history.push({ recipe, liked });
  const btn = liked ? $("#btnLike") : $("#btnNope");
  btn.classList.remove("pulse"); void btn.offsetWidth; btn.classList.add("pulse");

  if (liked) {
    const rect = btn.getBoundingClientRect();
    hearts(evt?.clientX ?? rect.left + rect.width / 2, evt?.clientY ?? rect.top);
    state.kept.unshift({ ...recipe, swiped_at: new Date().toISOString() });
    updateCount(true);
    renderKept();
  }
  render();

  const { error } = await db.from("meals_swipes").upsert({ recipe_id: recipe.id, liked, swiped_at: new Date().toISOString() });
  if (error) { console.error(error); toast("Couldn't save that swipe"); return; }
  if (++state.sinceRefine >= REFINE_EVERY) { state.sinceRefine = 0; refineTaste(true); }
}

// Re-learn taste from all swipes, then re-rank whatever is queued behind the visible cards.
async function refineTaste(announce) {
  const { data, error } = await db.rpc("meals_refine");
  if (error) console.error(error);
  state.deck = state.deck.slice(-3);
  state.dry = false;
  await refill();
  const top = (data?.top ?? []).map((t) => t.replace(/^src:/, ""));
  if (announce) toast(top.length ? `Tuned to you: more ${top.join(", ")}` : "Learning your taste…");
}

async function undo() {
  const last = state.history.pop();
  if (!last) return;
  state.deck.push(last.recipe);
  if (last.liked) {
    state.kept = state.kept.filter((r) => r.id !== last.recipe.id);
    updateCount();
    renderKept();
  }
  render();
  await db.from("meals_swipes").delete().eq("recipe_id", last.recipe.id);
}

async function harvest() {
  deckMsg.innerHTML = `<div class="spinner"></div><p>Raiding the pantries…</p>`;
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/meals-harvest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SUPABASE_ANON}`, apikey: SUPABASE_ANON },
    });
    const json = await res.json();
    toast(json.added ? `${json.added} fresh recipes` : "Nothing new yet. Check back tomorrow.");
  } catch { toast("The kitchens didn't answer"); }
  state.dry = false;
  await refill();
}

// ---------- kept ----------
async function loadKept() {
  const { data, error } = await db
    .from("meals_swipes")
    .select("swiped_at, recipe:meals_recipes(*)")
    .eq("liked", true)
    .order("swiped_at", { ascending: false });
  if (error) { console.error(error); return; }
  state.kept = data.filter((d) => d.recipe).map((d) => clean({ ...d.recipe, swiped_at: d.swiped_at }));
  updateCount();
  renderKept();
}

function updateCount(bump) {
  const c = $("#keptCount");
  c.textContent = state.kept.length;
  if (bump) { c.classList.remove("bump"); void c.offsetWidth; c.classList.add("bump"); }
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
  const sources = ["All", ...new Set(state.kept.map((r) => r.source))];
  if (!sources.includes(state.source)) state.source = "All";
  $("#chips").innerHTML = state.kept.length > 1
    ? sources.map((s) => `<button class="chip ${s === state.source ? "is-active" : ""}" data-source="${esc(s)}">${esc(s)}</button>`).join("")
    : "";

  const terms = norm(state.query).split(/\s+/).filter(Boolean);
  const rows = state.kept.filter((r) => {
    if (state.source !== "All" && r.source !== state.source) return false;
    const hay = norm(`${r.title} ${r.source} ${r.description || ""}`);
    return terms.every((t) => hay.includes(t));
  });

  $("#list").innerHTML = rows.map((r, i) => `
    <li class="item" data-id="${r.id}" style="animation-delay:${Math.min(i, 12) * 20}ms">
      <img src="${esc(r.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" />
      <a href="${esc(r.url)}" target="_blank" rel="noopener">
        <h4>${highlight(r.title, state.query.split(/\s+/).filter(Boolean))}</h4>
        <small>${esc(r.source)}</small>
      </a>
      <button class="rm" aria-label="Remove ${esc(r.title)}" title="Remove">
        <svg viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>
    </li>`).join("");

  const empty = $("#keptEmpty");
  empty.hidden = rows.length > 0;
  empty.querySelector("p").textContent = state.kept.length
    ? "No keepers match that. Try another word."
    : "Nothing kept yet. Go swipe right on something delicious.";
}

$("#list").addEventListener("click", async (e) => {
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
  const { error } = await db.from("meals_swipes").update({ liked: false }).eq("recipe_id", id);
  toast(error ? "Couldn't remove that" : "Removed");
});
$("#chips").addEventListener("click", (e) => {
  const c = e.target.closest(".chip");
  if (!c) return;
  state.source = c.dataset.source;
  renderKept();
});
$("#search").addEventListener("input", (e) => { state.query = e.target.value; renderKept(); });

// ---------- tabs & keys ----------
function show(view) {
  document.querySelectorAll(".tab").forEach((t) => {
    const on = t.dataset.view === view;
    t.classList.toggle("is-active", on);
    t.setAttribute("aria-selected", on);
  });
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("is-active", v.id === `view-${view}`));
  try { localStorage.setItem("forks:view", view); } catch {}
  if (view === "kept") setTimeout(() => window.matchMedia("(hover: hover)").matches && $("#search").focus(), 50);
}
document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => show(t.dataset.view)));

$("#btnLike").addEventListener("click", () => swipe(true));
$("#btnNope").addEventListener("click", () => swipe(false));
$("#btnUndo").addEventListener("click", undo);

document.addEventListener("keydown", (e) => {
  if (e.target.matches("input")) { if (e.key === "Escape") e.target.blur(); return; }
  if (!$("#view-swipe").classList.contains("is-active")) {
    if (e.key === "/") { e.preventDefault(); $("#search").focus(); }
    return;
  }
  if (e.key === "ArrowRight") swipe(true);
  else if (e.key === "ArrowLeft") swipe(false);
  else if (e.key === "ArrowUp") { const r = state.deck.at(-1); if (r) window.open(r.url, "_blank", "noopener"); }
  else if (e.key === "Backspace" || (e.key === "z" && (e.metaKey || e.ctrlKey))) { e.preventDefault(); undo(); }
});

// ---------- boot ----------
try { const v = localStorage.getItem("forks:view"); if (v) show(v); } catch {}
loadKept();
refineTaste(false);
