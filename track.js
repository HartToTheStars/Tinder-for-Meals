/* forks test-and-learn: anonymous first-party events and sticky A/B buckets.
   forksTrack(name, props) sends an event to Google Analytics (production only) and to Supabase meals_events.
   forksExp(name, variants) returns this device's variant for an experiment and tags every later event with it.
   Every link click is recorded as "click" with where it goes. No emails, names or account ids are ever sent. */
(function () {
  if (window.forksTrack) return;
  var SB = "https://dmwsylofgfocmbqvmgfe.supabase.co", KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtd3N5bG9mZ2ZvY21icXZtZ2ZlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUwMDg1NTMsImV4cCI6MjEwMDU4NDU1M30.Jxsz_HK6jE4y2T36RJMtRWpaXlk0ugyEL2b7CXTrgE8";
  var live = /(^|[.])forkslist[.]com$/.test(location.hostname), staging = /here[.]now$/.test(location.hostname);
  // Automated browsers send nothing to Supabase. Weaker signals are kept but flagged with props.bot = 1.
  var ua = navigator.userAgent || "";
  var bot = !!navigator.webdriver || /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|embedly|bingpreview|phantomjs|puppeteer|playwright|selenium|python|curl|wget|httpclient|java[/]|go-http|axios|node-fetch|scrapy|ahrefs|semrush|mj12|dotbot|petalbot|yandex|baidu|duckduckbot|applebot|google-inspectiontool|chrome-lighthouse/i.test(ua);
  var maybeBot = !bot && ((navigator.languages && navigator.languages.length === 0) || !screen.width || !window.outerWidth);
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
    if ((!live && !staging) || bot) return;
    if (maybeBot) props = Object.assign({ bot: 1 }, props);
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

  // Pageview once the page has been visible for 1 second without a break, after load so the page's
  // own scripts have called forksExp. Prerendered and background tabs that are never seen send nothing.
  var sent = false, timer = null;
  var arm = function () {
    clearTimeout(timer); timer = null;
    if (sent || document.visibilityState !== "visible") return;
    timer = setTimeout(function () { if (!sent && document.visibilityState === "visible") { sent = true; window.forksTrack("view", utm); } }, 1000);
  };
  var start = function () { arm(); document.addEventListener("visibilitychange", arm); };
  if (document.readyState === "complete") start(); else window.addEventListener("load", start);
})();
