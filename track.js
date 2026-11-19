/* forks test-and-learn: anonymous first-party events and sticky A/B buckets.
   forksTrack(name, props) sends an event to Google Analytics (production only) and to Supabase meals_events.
   forksExp(name, variants) returns this device's variant for an experiment and tags every later event with it.
   Every link click is recorded as "click" with where it goes. No emails, names or account ids are ever sent. */
(function () {
  if (window.forksTrack) return;
  var SB = "https://dmwsylofgfocmbqvmgfe.supabase.co", KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtd3N5bG9mZ2ZvY21icXZtZ2ZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwMDg1NTMsImV4cCI6MjEwMDU4NDU1M30.Jxsz_HK6jE4y2T36RJMtRWpaXlk0ugyEL2b7CXTrgE8";
  var live = /(^|[.])forkslist[.]com$/.test(location.hostname), staging = /here[.]now$/.test(location.hostname);
  var get = function (k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  var set = function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  var did = get("forks:did", null);
  if (!did) { did = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2)); set("forks:did", did); }
  var exps = get("forks:exp", {}), active = {};
  var path = function () { var p = location.pathname; return /^[/][A-Za-z]{3}[0-9]{4}[/]?$/.test(p) ? "/profile" : p; };
  var ref = (function () { try { var r = document.referrer ? new URL(document.referrer).hostname : ""; return r === location.hostname ? "" : r; } catch (e) { return ""; } })();
  var utm = (function () { var q = new URLSearchParams(location.search), o = {}; ["utm_source", "utm_medium", "utm_campaign"].forEach(function (k) { if (q.get(k)) o[k] = q.get(k).slice(0, 60); }); return o; })();
  var expStr = function () { return Object.keys(active).map(function (k) { return k + ":" + active[k]; }).join(",") || null; };

  window.forksExp = function (name, variants) {
    if (!exps[name] || variants.indexOf(exps[name]) < 0) { exps[name] = variants[Math.floor(Math.random() * variants.length)]; set("forks:exp", exps); }
    active[name] = exps[name];
    return exps[name];
  };
  window.forksTrack = function (name, props) {
    props = props || {};
    try { if (window.gtag) window.gtag("event", name, Object.assign({ exp: expStr() || undefined }, props)); } catch (e) {}
    if (!live && !staging) return;
    try {
      fetch(SB + "/rest/v1/meals_events", {
        method: "POST", keepalive: true,
        headers: { apikey: KEY, Authorization: "Bearer " + KEY, "content-type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ name: name, path: path(), did: did, exp: expStr(), ref: ref || null, host: live ? "prod" : "staging", props: props })
      }).catch(function () {});
    } catch (e) {}
  };

  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a[href]");
    if (!a) return;
    var u; try { u = new URL(a.getAttribute("href"), location.href); } catch (x) { return; }
    var p = { el: (a.getAttribute("data-track") || a.className || "").toString().slice(0, 40) };
    if (u.hostname !== location.hostname) { p.to = "out"; p.host = u.hostname; }
    else if (u.pathname === "/" ) { p.to = "app"; }
    else { p.to = u.pathname.split("/")[1] || "home"; }
    window.forksTrack("click", p);
  }, true);

  // Pageview after the page's own scripts have had a chance to call forksExp.
  var view = function () { window.forksTrack("view", utm); };
  if (document.readyState === "complete") setTimeout(view, 0); else window.addEventListener("load", function () { setTimeout(view, 0); });
})();
