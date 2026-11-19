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
    check: '<path d="M20 6 9 17l-5-5"/>'
  };
  var svg = function (n) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICON[n] + "</svg>"; };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var $ = function (sel, root) { return (root || sec).querySelector(sel); };

  var stage = $(".sw-stage"), sub = $(".sw-sub"), pill = $(".sw-pill"), acts = $(".sw-acts"), done = $(".sw-done");
  var i = 0, busy = false, keptHere = [], asked = false, lastAct = Date.now();

  // ---------- cards ----------
  function cardHTML(r) {
    return '<img src="' + esc(r.image) + '" alt="" referrerpolicy="no-referrer" draggable="false">' +
      '<span class="sw-stamp sw-keep">KEEP</span><span class="sw-stamp sw-nope">NOPE</span>' +
      '<div class="sw-body"><span class="sw-src">' + esc(r.source) + "</span><h3>" + esc(r.title) + "</h3></div>";
  }
  function render() {
    stage.innerHTML = "";
    for (var k = Math.min(i + 1, deck.length - 1); k >= i; k--) {
      var el = document.createElement("article");
      el.className = "sw-card" + (k === i ? " is-top" : " is-next");
      el.innerHTML = cardHTML(deck[k]);
      stage.appendChild(el);
    }
    sub.textContent = "Right to keep, left to pass. " + (i + 1) + " of " + deck.length + ".";
    var top = topCard();
    if (top) bindDrag(top);
  }
  function topCard() { return stage.querySelector(".sw-card.is-top"); }
  function stamps(el, x) {
    var k = Math.max(0, Math.min(1, x / 90)), n = Math.max(0, Math.min(1, -x / 90));
    el.querySelector(".sw-keep").style.opacity = k;
    el.querySelector(".sw-nope").style.opacity = n;
  }

  // ---------- swipes ----------
  function slim(r) { return { id: r.id, url: r.url, title: r.title, description: r.description, image: r.image, source: r.source, category: r.category, tags: r.tags }; }
  function record(r, liked) {
    var fresh = auth && auth.expires_at && auth.expires_at * 1000 > Date.now() + 30000;
    if (signedIn && fresh) {
      fetch(SB + "/rest/v1/meals_user_swipes?on_conflict=user_id,recipe_id", {
        method: "POST",
        headers: { apikey: KEY, Authorization: "Bearer " + auth.access_token, "content-type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ user_id: auth.user.id, recipe_id: r.id, liked: liked, swiped_at: new Date().toISOString() })
      }).catch(function () {});
      return;
    }
    guest = ls.get("forks:guest", null) || guest;
    if (!guest.swipes) guest.swipes = {};
    if (!guest.kept) guest.kept = [];
    guest.swipes[r.id] = liked;
    if (liked) guest.kept = [slim(r)].concat(guest.kept.filter(function (x) { return x.id !== r.id; }));
    ls.set("forks:guest", guest);
  }
  function go(liked) {
    var el = topCard();
    if (busy || !el) return;
    busy = true; lastAct = Date.now();
    var r = deck[i];
    stamps(el, liked ? 120 : -120);
    el.style.transition = reduce ? "none" : "transform .38s cubic-bezier(.2,.8,.2,1), opacity .38s";
    el.style.transform = "translate(" + (liked ? 140 : -140) + "%, 0) rotate(" + (liked ? 18 : -18) + "deg)";
    el.style.opacity = "0";
    record(r, liked);
    if (liked) keptHere.push(r);
    setTimeout(function () {
      i++; busy = false;
      updatePill();
      if (i >= deck.length) finish(); else render();
      if (liked && !asked && !signedIn && !ls.get("forks:browsing", false)) { asked = true; openSheet("save"); }
    }, reduce ? 60 : 380);
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
  $(".sw-btn-keep").addEventListener("click", function () { go(true); });
  $(".sw-btn-nope").addEventListener("click", function () { go(false); });
  sec.addEventListener("keydown", function (e) {
    if (e.target.matches("input, textarea")) return;
    if (e.key === "ArrowRight") { e.preventDefault(); go(true); }
    if (e.key === "ArrowLeft") { e.preventDefault(); go(false); }
  });

  // ---------- drag, like the app ----------
  function bindDrag(el) {
    var x0 = 0, dx = 0, id = null;
    el.addEventListener("pointerdown", function (e) {
      if (busy) return;
      id = e.pointerId; x0 = e.clientX; dx = 0; lastAct = Date.now();
      el.setPointerCapture(id); el.style.transition = "none"; el.classList.add("is-drag");
    });
    el.addEventListener("pointermove", function (e) {
      if (e.pointerId !== id) return;
      dx = e.clientX - x0;
      el.style.transform = "translate(" + dx + "px, 0) rotate(" + dx / 18 + "deg)";
      stamps(el, dx);
    });
    var end = function (e) {
      if (e.pointerId !== id) return;
      id = null; el.classList.remove("is-drag");
      if (Math.abs(dx) > 90) return go(dx > 0);
      el.style.transition = "transform .25s cubic-bezier(.2,.8,.2,1)";
      el.style.transform = ""; stamps(el, 0);
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
  }

  // ---------- teach: lean KEEP, then NOPE, when the deck comes into view and after 7 idle seconds ----------
  var visible = false;
  function teach() {
    var el = topCard();
    if (reduce || busy || !el || !el.animate || sheetOpen()) return;
    if (el.getAnimations && el.getAnimations().length) return;
    var lean = function (x, r) { return "translate(" + x + "px, 0) rotate(" + r + "deg)"; };
    el.animate([{ transform: lean(0, 0) }, { transform: lean(36, 3), offset: .22 }, { transform: lean(36, 3), offset: .38 },
      { transform: lean(0, 0), offset: .5 }, { transform: lean(-36, -3), offset: .72 }, { transform: lean(-36, -3), offset: .88 }, { transform: lean(0, 0) }],
      { duration: 1900, easing: "ease-in-out" });
    var o = function (sel, offs) { el.querySelector(sel).animate(offs, { duration: 1900 }); };
    o(".sw-keep", [{ opacity: 0 }, { opacity: .85, offset: .22 }, { opacity: .85, offset: .38 }, { opacity: 0, offset: .5 }, { opacity: 0 }]);
    o(".sw-nope", [{ opacity: 0 }, { opacity: 0, offset: .5 }, { opacity: .85, offset: .72 }, { opacity: .85, offset: .88 }, { opacity: 0 }]);
  }
  // Most of the deck on screen counts as "in view". A plain position check, so it works in every browser.
  var taught = false;
  function checkView() {
    if (stage.hidden) { visible = false; return; }
    var r = stage.getBoundingClientRect(), h = window.innerHeight || document.documentElement.clientHeight;
    visible = r.top < h * 0.85 && r.bottom > h * 0.35;
    if (visible && !taught) { taught = true; lastAct = Date.now(); setTimeout(teach, 600); }
  }
  addEventListener("scroll", checkView, { passive: true });
  addEventListener("resize", checkView, { passive: true });
  setInterval(function () {
    checkView();
    if (visible && !document.hidden && Date.now() - lastAct > 7000) { lastAct = Date.now(); teach(); }
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
