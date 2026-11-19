// forks. "Swipe a few" deck on recipe pages (/s/<id>/).
// A small taste of the app: five similar recipes, Keep or Nope by button, drag or arrow key. Swipes go where the
// app looks for them: guests' into localStorage "forks:guest" (same shape as app.js), signed-in people's into
// meals_user_swipes through the REST API with their own session. The first keep asks a guest to save their keeps
// (the app's own "Don't lose your keeps" sheet and meals-auth call); the Keeps pill lists what's on this device.
(function () {
  "use strict";
  var sec = document.getElementById("sw");
  var dataEl = document.getElementById("swDeck");
  if (!sec || !dataEl) return;
  var deck;
  try { deck = JSON.parse(dataEl.textContent); } catch (e) { return; }

  var SB = sec.getAttribute("data-sb"), KEY = sec.getAttribute("data-key");
  var MORE = sec.getAttribute("data-more") || "/", NOUN = sec.getAttribute("data-noun") || "recipes";
  var EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var ls = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };
  var auth = ls.get("forks-auth", null);
  var signedIn = !!(auth && auth.access_token && auth.user && auth.user.id);
  var guest = ls.get("forks:guest", null) || { swipes: {}, kept: [] };
  if (!guest.swipes) guest.swipes = {};
  if (!guest.kept) guest.kept = [];

  deck = deck.filter(function (r) { return guest.swipes[r.id] === undefined; });
  if (deck.length < 2) return;
  sec.hidden = false;

  var ICON = {
    heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    bookmark: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>',
    mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/>',
    ext: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>'
  };
  var svg = function (n) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICON[n] + "</svg>"; };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var $ = function (sel, root) { return (root || sec).querySelector(sel); };

  var stage = $(".sw-stage"), sub = $(".sw-sub"), pill = $(".sw-pill"), acts = $(".sw-acts"), done = $(".sw-done");
  var btnUndo = $(".sw-act-undo"), btnNope = $(".sw-act-nope"), btnLike = $(".sw-act-like"), btnOpen = $(".sw-act-open");
  var i = 0, busy = false, keptHere = [], history = [], asked = false, lastAct = Date.now();
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  // ---------- cards: the homepage's own card (photo, full-card KEEP / NOPE stamps, source pill, tag icons) ----------
  function cardHTML(r) {
    var tags = (r.ti || []).map(function (t) { return '<span title="' + esc(t[0]) + '"><svg viewBox="0 0 24 24" aria-hidden="true">' + t[1] + "</svg></span>"; }).join("");
    return '<img src="' + esc(r.image) + '" alt="" referrerpolicy="no-referrer" draggable="false">' +
      '<div class="sw-stamp sw-stamp-like"><span>KEEP</span></div><div class="sw-stamp sw-stamp-nope"><span>NOPE</span></div>' +
      '<div class="sw-cbody"><span class="sw-source">' + esc(r.source) + "</span>" + (tags ? '<span class="sw-ctags">' + tags + "</span>" : "") +
      "<h3>" + esc(r.title) + "</h3>" + (r.description ? "<p>" + esc(r.description) + "</p>" : "") + "</div>";
  }
  // Rebuild the stack under any card that's still being thrown (that one keeps flying on top).
  function render() {
    Array.prototype.forEach.call(stage.querySelectorAll(".sw-card:not(.gone)"), function (c) { c.remove(); });
    for (var d = 2; d >= 0; d--) {
      var k = i + d;
      if (k >= deck.length) continue;
      var el = document.createElement("article");
      el.className = "sw-card";
      el.setAttribute("data-depth", d);
      el.innerHTML = cardHTML(deck[k]);
      stage.appendChild(el);
      if (d === 0) bindDrag(el);
    }
    sub.textContent = "Right to keep, left to pass. " + Math.min(i + 1, deck.length) + " of " + deck.length + ".";
    btnUndo.disabled = history.length === 0;
    if (deck[i]) btnOpen.href = deck[i].url;
  }
  function topCard() { return stage.querySelector('.sw-card[data-depth="0"]:not(.gone)'); }

  // ---------- storage ----------
  function slim(r) { return { id: r.id, url: r.url, title: r.title, description: r.description, image: r.image, source: r.source, category: r.category, tags: r.tags }; }
  var fresh = function () { return signedIn && auth.expires_at && auth.expires_at * 1000 > Date.now() + 30000; };
  var rest = function (method, q, body) {
    return fetch(SB + "/rest/v1/meals_user_swipes" + q, {
      method: method, body: body ? JSON.stringify(body) : undefined,
      headers: { apikey: KEY, Authorization: "Bearer " + auth.access_token, "content-type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" }
    }).catch(function () {});
  };
  function loadGuest() { var g = ls.get("forks:guest", null) || guest; g.swipes = g.swipes || {}; g.kept = g.kept || []; return (guest = g); }
  function record(r, liked) {
    if (fresh()) { rest("POST", "?on_conflict=user_id,recipe_id", { user_id: auth.user.id, recipe_id: r.id, liked: liked, swiped_at: new Date().toISOString() }); return; }
    loadGuest();
    guest.swipes[r.id] = liked;
    if (liked) guest.kept = [slim(r)].concat(guest.kept.filter(function (x) { return x.id !== r.id; }));
    ls.set("forks:guest", guest);
  }
  function unrecord(r) {
    if (fresh()) { rest("DELETE", "?user_id=eq." + auth.user.id + "&recipe_id=eq." + r.id); return; }
    loadGuest();
    delete guest.swipes[r.id];
    guest.kept = guest.kept.filter(function (x) { return x.id !== r.id; });
    ls.set("forks:guest", guest);
  }

  // ---------- the homepage's swipe: lean, slam the stamp, throw ----------
  function hearts(x, y) {
    var colors = ["#e8553e", "#3f9b6b", "#e9a23b", "#e8553e"];
    for (var n = 0; n < 9; n++) {
      var h = document.createElement("span");
      h.className = "sw-heart";
      h.innerHTML = svg("heart");
      h.style.color = colors[n % colors.length];
      h.style.left = x + (Math.random() * 60 - 30) + "px";
      h.style.top = y + (Math.random() * 30 - 15) + "px";
      h.style.setProperty("--dx", Math.random() * 140 - 70 + "px");
      h.style.setProperty("--rot", Math.random() * 80 - 40 + "deg");
      h.style.animationDelay = n * 35 + "ms";
      document.body.appendChild(h);
      setTimeout(function (el) { return function () { el.remove(); }; }(h), 1400);
    }
  }
  function pulse(btn) { btn.classList.remove("sw-pulse"); void btn.offsetWidth; btn.classList.add("sw-pulse"); }
  async function stampSlam(el, stamp, s, f) {
    var dragged = !!f;
    f = f || { dx: 0, dy: 0 };
    el.style.transition = "none";
    var from = "translate(" + f.dx + "px, " + f.dy + "px) rotate(" + f.dx / 14 + "deg)";
    var shown = Number(stamp.style.opacity) || 0;
    if (reduce) {
      stamp.style.opacity = 1;
      await el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, delay: 120, fill: "forwards" }).finished;
      return;
    }
    var span = stamp.querySelector("span"), rot = s > 0 ? -10 : 10;
    var lx = dragged ? f.dx + s * 12 : s * 54, ly = dragged ? f.dy : 0, lr = dragged ? f.dx / 14 + s * 1.5 : s * 5;
    var lean = "translate(" + lx + "px, " + ly + "px) rotate(" + lr + "deg)";
    el.animate([{ transform: from }, { transform: lean }], { duration: dragged ? 90 : 140, easing: "cubic-bezier(.2,.8,.2,1)", fill: "forwards" });
    stamp.style.opacity = 1;
    if (!dragged) stamp.animate([{ opacity: shown }, { opacity: 1 }], { duration: 90, fill: "forwards" });
    await span.animate(dragged && shown > 0.4 ? [
      { transform: "scale(1) rotate(" + rot + "deg)" },
      { transform: "scale(1.28) rotate(" + rot * 1.4 + "deg)", offset: 0.35 },
      { transform: "scale(.94) rotate(" + rot + "deg)", offset: 0.7 },
      { transform: "scale(1) rotate(" + rot + "deg)" }
    ] : [
      { transform: "scale(2.4) rotate(" + rot * 2.2 + "deg)", opacity: 0 },
      { transform: "scale(.86) rotate(" + rot + "deg)", opacity: 1, offset: 0.55 },
      { transform: "scale(1.06) rotate(" + rot + "deg)", offset: 0.78 },
      { transform: "scale(1) rotate(" + rot + "deg)", opacity: 1 }
    ], { duration: dragged ? 240 : 300, easing: "cubic-bezier(.2,.7,.3,1)", fill: "forwards" }).finished;
    try { navigator.vibrate && navigator.vibrate(s > 0 ? [14] : [8, 40, 8]); } catch (e) {}
    await el.animate([
      { transform: lean }, { transform: lean + " translate(" + -s * 5 + "px, 2px)" },
      { transform: lean + " translate(" + s * 3 + "px, -1px)" }, { transform: lean }
    ], { duration: 140, fill: "forwards" }).finished;
    await sleep(dragged ? 90 : 150);
    var w = window.innerWidth, cw = el.offsetWidth;
    var tx = s * (w + cw * 0.9), ty = ly - 60, r1 = lr + s * 40;
    await el.animate([
      { transform: lean, opacity: 1 },
      { transform: "translate(" + (lx + (tx - lx) * 0.55) + "px, " + (ly + (ty - ly) * 0.55) + "px) rotate(" + (lr + (r1 - lr) * 0.6) + "deg)", opacity: 1, offset: 0.5 },
      { transform: "translate(" + tx + "px, " + ty + "px) rotate(" + r1 + "deg)", opacity: 1, offset: 0.92 },
      { transform: "translate(" + tx * 1.04 + "px, " + ty + "px) rotate(" + r1 + "deg)", opacity: 0 }
    ], { duration: dragged ? 420 : 480, easing: "cubic-bezier(.22,.61,.36,1)", fill: "forwards" }).finished;
  }
  function go(liked, evt) {
    var el = topCard();
    if (busy || !el || sheetOpen()) return;
    busy = true; lastAct = Date.now();
    if (el._stopTeach) el._stopTeach();
    var r = deck[i], s = liked ? 1 : -1;
    el.classList.add("gone");
    record(r, liked);
    history.push({ r: r, liked: liked });
    if (liked) keptHere.push(r);
    var btn = liked ? btnLike : btnNope;
    pulse(btn);
    if (liked) { var rc = btn.getBoundingClientRect(); hearts(evt && evt.clientX != null ? evt.clientX : rc.left + rc.width / 2, evt && evt.clientY != null ? evt.clientY : rc.top); }
    var last = i + 1 >= deck.length;
    stampSlam(el, el.querySelector(liked ? ".sw-stamp-like" : ".sw-stamp-nope"), s, evt && evt.pointerType ? el._fling : null)
      .catch(function () {}).then(function () {
        el.remove();
        if (last) finish();
      });
    // The stamp lands before the next card moves up, like the homepage.
    setTimeout(function () {
      i++; busy = false;
      updatePill();
      if (!last) render(); else { btnUndo.disabled = false; }
      if (liked && !asked && !signedIn && !ls.get("forks:browsing", false)) { asked = true; setTimeout(function () { openSheet("save"); }, last ? 700 : 350); }
    }, reduce ? 60 : 640);
  }
  function undo() {
    if (busy || !history.length) return;
    var h = history.pop();
    unrecord(h.r);
    keptHere = keptHere.filter(function (x) { return x.id !== h.r.id; });
    i--;
    done.hidden = true; stage.hidden = false; acts.hidden = false;
    render(); updatePill(); lastAct = Date.now();
  }
  function finish() {
    stage.hidden = true; acts.hidden = true;
    sub.textContent = "That's all " + deck.length + ".";
    var n = keptHere.length;
    $(".sw-done-t").innerHTML = (n ? "You kept " + n : "Nothing kept yet") + '<span class="dot">.</span>';
    $(".sw-done-p").textContent = n ? (signedIn ? "They're in your keeps." : "They're in your keeps on this device, and forks already knows a little about what you like.")
      : "No worries. There are plenty more " + NOUN + " where those came from.";
    $(".sw-done-thumbs").innerHTML = keptHere.map(function (r) { return '<img src="' + esc(r.image) + '" alt="' + esc(r.title) + '" referrerpolicy="no-referrer">'; }).join("");
    $(".sw-see").hidden = !n;
    done.hidden = false;
  }
  btnUndo.innerHTML = svg("undo"); btnNope.innerHTML = svg("x"); btnLike.innerHTML = svg("heart"); btnOpen.innerHTML = svg("ext");
  btnLike.addEventListener("click", function () { go(true); });
  btnNope.addEventListener("click", function () { go(false); });
  btnUndo.addEventListener("click", undo);
  sec.addEventListener("keydown", function (e) {
    if (e.target.matches("input, textarea")) return;
    if (e.key === "ArrowRight") { e.preventDefault(); go(true); }
    if (e.key === "ArrowLeft") { e.preventDefault(); go(false); }
    if (e.key === "Backspace") { e.preventDefault(); undo(); }
  });

  // ---------- drag: the homepage's feel (follows the finger, stamp fades in by distance) ----------
  function bindDrag(el) {
    var sx = 0, sy = 0, dx = 0, dy = 0, down = false;
    var like = el.querySelector(".sw-stamp-like"), nope = el.querySelector(".sw-stamp-nope");
    el.addEventListener("pointerdown", function (e) {
      if (busy || el !== topCard()) return;
      down = true; sx = e.clientX; sy = e.clientY; dx = dy = 0; lastAct = Date.now();
      el.setPointerCapture(e.pointerId);
      el.classList.add("dragging");
    });
    el.addEventListener("pointermove", function (e) {
      if (!down) return;
      dx = e.clientX - sx; dy = e.clientY - sy;
      el.style.transform = "translate(" + dx + "px, " + dy * 0.4 + "px) rotate(" + dx / 14 + "deg)";
      like.style.opacity = Math.max(0, Math.min(1, dx / 90));
      nope.style.opacity = Math.max(0, Math.min(1, -dx / 90));
    });
    var end = function (e) {
      if (!down) return;
      down = false;
      el.classList.remove("dragging");
      var threshold = Math.min(110, el.offsetWidth * 0.28);
      el._fling = { dx: dx, dy: dy * 0.4 };
      if (dx > threshold) go(true, e);
      else if (dx < -threshold) go(false, e);
      else { el.style.transform = ""; like.style.opacity = nope.style.opacity = 0; }
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
  }

  // ---------- teach: the homepage's lean (KEEP, then NOPE, the stamp washing over the card) ----------
  var visible = false;
  function teach(el, delay) {
    if (!el || el._teaching || reduce || busy || !el.animate || sheetOpen()) return false;
    el._teaching = true;
    var like = el.querySelector(".sw-stamp-like"), nope = el.querySelector(".sw-stamp-nope");
    var lean = function (x, r) { return "translate(" + x + "px, 0) rotate(" + r + "deg)"; };
    var card = el.animate([
      { transform: lean(0, 0), offset: 0 }, { transform: lean(36, 3), offset: 0.22 }, { transform: lean(36, 3), offset: 0.38 },
      { transform: lean(-36, -3), offset: 0.62 }, { transform: lean(-36, -3), offset: 0.78 }, { transform: lean(0, 0), offset: 1 }
    ], { duration: 1800, delay: delay, easing: "cubic-bezier(.45,0,.25,1)", fill: "forwards" });
    var fade = function (stamp, a, b, c, d) {
      return stamp.animate([{ opacity: 0, offset: 0 }, { opacity: 0, offset: a }, { opacity: 0.9, offset: b },
        { opacity: 0.9, offset: c }, { opacity: 0, offset: d }, { opacity: 0, offset: 1 }], { duration: 1800, delay: delay, fill: "forwards" });
    };
    var anims = [card, fade(like, 0.05, 0.22, 0.38, 0.5), fade(nope, 0.5, 0.62, 0.78, 0.92)];
    var stop = function () { anims.forEach(function (a) { a.cancel(); }); el._teaching = false; };
    card.finished.then(stop).catch(function () {});
    el.addEventListener("pointerdown", stop, { once: true });
    document.addEventListener("keydown", stop, { once: true });
    el._stopTeach = stop;
    return true;
  }
  // Most of the deck on screen counts as "in view". A plain position check, so it works in every browser.
  var taught = false;
  function checkView() {
    if (stage.hidden) { visible = false; return; }
    var r = stage.getBoundingClientRect(), h = window.innerHeight || document.documentElement.clientHeight;
    visible = r.top < h * 0.85 && r.bottom > h * 0.35;
    if (visible && !taught) { taught = true; lastAct = Date.now(); teach(topCard(), 500); }
  }
  addEventListener("scroll", checkView, { passive: true });
  addEventListener("resize", checkView, { passive: true });
  setInterval(function () {
    checkView();
    if (visible && !document.hidden && Date.now() - lastAct > 7000) { lastAct = Date.now() + 1800; teach(topCard(), 0); }
  }, 1000);
  ["pointerdown", "keydown"].forEach(function (t) { addEventListener(t, function () { lastAct = Date.now(); }, { passive: true }); });

  // ---------- Keeps pill ----------
  function keepCount() { return signedIn ? keptHere.length : (ls.get("forks:guest", guest).kept || []).length; }
  function updatePill() {
    var n = keepCount();
    pill.hidden = !n;
    pill.querySelector(".sw-pill-n").textContent = n;
  }
  pill.innerHTML = svg("bookmark") + 'Keeps <span class="sw-pill-n">0</span>';
  pill.addEventListener("click", function () {
    if (signedIn) { openApp(); return; }
    openSheet("keeps");
  });
  updatePill();
  function openApp() { ls.set("forks:view", "kept"); location.href = "/"; }
  $(".sw-see").addEventListener("click", function () { signedIn ? openApp() : openSheet("keeps"); });

  // ---------- sheet: save your keeps / your keeps ----------
  var wrap = document.createElement("div");
  wrap.className = "sw-sheet-wrap";
  wrap.hidden = true;
  wrap.innerHTML = '<div class="sw-scrim"></div><div class="sw-sheet" role="dialog" aria-modal="true" aria-labelledby="swSheetT" tabindex="-1"></div>';
  document.body.appendChild(wrap);
  var sheet = wrap.querySelector(".sw-sheet"), opener = null;
  function sheetOpen() { return !wrap.hidden; }
  function closeSheet() {
    wrap.hidden = true;
    document.documentElement.classList.remove("sw-lock");
    if (opener && opener.focus) opener.focus();
    lastAct = Date.now();
  }
  wrap.querySelector(".sw-scrim").addEventListener("click", closeSheet);
  wrap.addEventListener("keydown", function (e) { if (e.key === "Escape") closeSheet(); });
  function thumbs(list) { return list.slice(0, 5).map(function (r) { return '<img src="' + esc(r.image) + '" alt="" referrerpolicy="no-referrer">'; }).join(""); }

  function openSheet(mode) {
    opener = document.activeElement;
    var kept = (ls.get("forks:guest", guest).kept || []), n = kept.length;
    if (mode === "save") {
      sheet.innerHTML = '<div class="sw-grab"></div><div class="sw-ic">' + svg("bookmark") + '</div>' +
        '<h3 id="swSheetT">Don\'t lose your keeps</h3>' +
        '<p class="sw-sheet-p">You have ' + n + " keep" + (n === 1 ? "" : "s") + " so far. Add your email and we'll save " + (n === 1 ? "it" : "them") + ".</p>" +
        '<div class="sw-thumbs">' + thumbs(kept) + "</div>" +
        '<form class="sw-form" novalidate><label><span class="sw-sr">Email</span><input type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck="false" placeholder="you@example.com" required></label>' +
        '<p class="sw-err" role="alert" hidden></p><button class="btn sw-go" type="submit">Save my keeps</button></form>' +
        '<button class="sw-text" type="button" data-skip>No thanks, just browsing</button>' +
        '<p class="sw-fine">We\'ll never sell your data. <a href="/privacy.html">Privacy</a></p>';
      sheet.querySelector("[data-skip]").addEventListener("click", function () { ls.set("forks:browsing", true); closeSheet(); });
      sheet.querySelector(".sw-form").addEventListener("submit", submit);
    } else {
      sheet.innerHTML = '<div class="sw-grab"></div><div class="sw-sheet-h"><h3 id="swSheetT">Your keeps<span class="dot">.</span></h3>' +
        '<button class="sw-x" type="button" aria-label="Close">' + svg("x") + "</button></div>" +
        '<ul class="sw-list">' + kept.slice(0, 30).map(function (r) {
          return '<li><a href="/s/' + encodeURIComponent(r.id) + '/"><img src="' + esc(r.image) + '" alt="" referrerpolicy="no-referrer"><span><b>' + esc(r.title) + "</b><small>" + esc(r.source) + "</small></span></a></li>";
        }).join("") + "</ul>" +
        '<p class="sw-sheet-p sw-left">These live on this device for now. They\'re also waiting in the Keeps tab when you open forks.</p>' +
        '<button class="btn sw-go" type="button" data-save>Save them with your email</button>' +
        '<button class="sw-text sw-strong" type="button" data-open>Open forks</button>';
      sheet.querySelector(".sw-x").addEventListener("click", closeSheet);
      sheet.querySelector("[data-save]").addEventListener("click", function () { openSheet("save"); });
      sheet.querySelector("[data-open]").addEventListener("click", openApp);
    }
    wrap.hidden = false;
    document.documentElement.classList.add("sw-lock");
    var first = sheet.querySelector(mode === "save" ? "input" : ".sw-x");
    setTimeout(function () { (window.matchMedia && matchMedia("(hover: hover)").matches && first ? first : sheet).focus(); }, 50);
  }

  function sent(title, text, icon) {
    sheet.innerHTML = '<div class="sw-grab"></div><div class="sw-ic">' + svg(icon) + '</div><h3 id="swSheetT">' + esc(title) + "</h3>" +
      '<p class="sw-sheet-p">' + esc(text) + '</p><button class="btn sw-go" type="button" data-close>Keep swiping</button>';
    sheet.querySelector("[data-close]").addEventListener("click", closeSheet);
    sheet.focus();
  }
  function submit(e) {
    e.preventDefault();
    var form = e.target, input = form.querySelector("input"), err = form.querySelector(".sw-err"), btn = form.querySelector(".sw-go");
    var email = input.value.trim().toLowerCase();
    var fail = function (m) { err.textContent = m; err.hidden = false; btn.disabled = false; btn.classList.remove("is-busy"); };
    if (!EMAIL_OK.test(email)) return fail("That doesn't look like an email address.");
    err.hidden = true; btn.disabled = true; btn.classList.add("is-busy");
    var g = ls.get("forks:guest", guest), sw = g.swipes || {}, liked = [], noped = [];
    Object.keys(sw).forEach(function (id) { (sw[id] ? liked : noped).push(id); });
    var keeps = (g.kept || []).length;
    fetch(SB + "/functions/v1/meals-auth", {
      method: "POST",
      headers: { Authorization: "Bearer " + KEY, apikey: KEY, "content-type": "application/json" },
      body: JSON.stringify({ email: email, origin: location.origin, guest: { liked: liked, noped: noped } })
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (json) {
        if (res.ok && json.status === "new") {
          ls.set("forks:pendingEmail", email);
          return sent("Saved. Check your inbox", "We sent a link to " + email + ". Tap it to finish signing in, on this phone or any other." + (keeps ? " Your keeps are already saved to your account." : ""), "mail");
        }
        if (res.ok && json.status === "existing") {
          ls.set("forks:pendingEmail", email);
          return sent("Welcome back", email + " already has an account, so we sent you a magic link to sign in." + (keeps ? " Today's keeps save to your account once you tap that link." : ""), "mail");
        }
        if (json.error === "slow_down") return fail("We just sent you a link. Give it a minute, then try again.");
        if (json.error === "email_not_configured") return fail("Email sign-in isn't switched on yet. Your keeps are safe on this device for now.");
        fail("Couldn't send that. Try again?");
      });
    }).catch(function () { fail("Couldn't reach the kitchen. Try again?"); });
  }

  render();
  checkView();
})();
