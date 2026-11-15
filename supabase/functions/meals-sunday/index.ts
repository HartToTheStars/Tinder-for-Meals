// Sunday dinner pick: one email a week to everyone with an account, unless they turned it off.
// POST { user_ids?: string[], dry?: boolean } with header x-forks-key: <SUNDAY_KEY secret>.
//   user_ids: only these people (used for test sends); omitted = every account that hasn't turned it off and
//   wasn't sent one in the last 6 days. On by default: no prefs row means on.
//   dry: return the rendered emails instead of sending.
// Emails always go to the person's own account email, never to an address passed in.
// Sent through Resend (RESEND_API_KEY; sender MAIL_FROM, default hello@forkslist.com).
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const SITE = "https://forkslist.com";
const FROM = Deno.env.get("MAIL_FROM") ?? "forks <hello@forkslist.com>";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const https = (u: string) => String(u || "").replace(/^http:\/\//, "https://");

type Recipe = { id?: string; title: string; source?: string; url: string; image: string; with_name?: string; with_color?: string };
type Person = { name: string; color: string | null; n: number; key: string; recipes: Recipe[] };
type Follower = { user_id: string; name: string; color: string | null; at: string; follows_back: boolean };
type Digest = { name: string; color: string | null; email: string; unsub_token: string; pick: Recipe | null; people: Person[]; new_followers: Follower[]; new_follower_count: number; follower_total: number };

// Same palette the app uses for avatars without a saved color.
const PALETTE = ["#e8553e", "#3f9b6b", "#d9922e", "#6f8fd8", "#7a5fa8", "#c4402b", "#2f7a52"];
const colorFor = (name: string, c: string | null) => c || PALETTE[[...name].reduce((a, ch) => a + ch.charCodeAt(0), 0) % PALETTE.length];

function ordinal(n: number) {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${s}`;
}
function dateLine(d = new Date()) {
  const tz = "America/New_York";
  const weekday = d.toLocaleDateString("en-US", { weekday: "long", timeZone: tz });
  const month = d.toLocaleDateString("en-US", { month: "long", timeZone: tz });
  const day = Number(d.toLocaleDateString("en-US", { day: "numeric", timeZone: tz }));
  return `${weekday}, ${month} ${ordinal(day)}`;
}
const weekday = (iso: string) => new Date(iso).toLocaleDateString("en-US", { weekday: "long", timeZone: "America/New_York" });
const list = (names: string[]) => names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

function preview(d: Digest) {
  const bits: string[] = [];
  if (d.people.length) bits.push(`what ${list(d.people.map((p) => p.name))} kept`);
  if (d.new_follower_count) bits.push(`${d.new_follower_count} new follower${d.new_follower_count === 1 ? "" : "s"}`);
  return bits.length ? `Dinner's decided. Plus ${bits.join(", and ")}.` : "Dinner's decided. Picked from what you keep.";
}

const avatar = (name: string, color: string | null, size: number) =>
  `<td width="${size}" height="${size}" align="center" valign="middle" style="width:${size}px;height:${size}px;border-radius:50%;background:${esc(colorFor(name, color))};color:#ffffff;font:700 ${Math.round(size * 0.44)}px Georgia,serif;">${esc(name.charAt(0).toUpperCase())}</td>`;
const card = (inner: string, pad = "20px 18px") =>
  `<tr><td style="padding:0 0 18px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fffdf9;border:1px solid #e9dfd2;border-radius:24px;"><tr><td style="padding:${pad};">${inner}</td></tr></table></td></tr>`;
const h2 = (t: string) => `<div style="font:700 21px Georgia,'Times New Roman',serif;color:#2a211c;margin:0 0 14px;">${esc(t)}<span style="color:#e8553e;">.</span></div>`;

function render(d: Digest) {
  const p = d.pick!;
  const unsub = `${SITE}/?unsub=${encodeURIComponent(d.unsub_token)}`;

  const hero = `<tr><td style="padding:0 0 18px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fffdf9;border:1px solid #e9dfd2;border-radius:24px;overflow:hidden;">
    <tr><td style="padding:0;"><a href="${esc(https(p.url))}"><img src="${esc(https(p.image))}" alt="${esc(p.title)}" width="358" style="display:block;width:100%;max-width:100%;height:auto;border-radius:24px 24px 0 0;"></a></td></tr>
    ${p.with_name ? `<tr><td style="padding:14px 20px 0;"><table role="presentation" cellpadding="0" cellspacing="0"><tr>${avatar(p.with_name, p.with_color ?? null, 24)}<td width="6"></td>${avatar(d.name, d.color, 24)}<td style="padding-left:8px;font:600 12.5px Helvetica,Arial,sans-serif;color:#2a211c;">You and ${esc(p.with_name)} both kept this</td></tr></table></td></tr>` : ""}
    <tr><td style="padding:16px 20px 22px;">
      <div style="font:700 11px Helvetica,Arial,sans-serif;letter-spacing:1.1px;text-transform:uppercase;color:#c4402b;">Your dinner this week</div>
      <div style="font:700 30px/1.1 Georgia,'Times New Roman',serif;color:#2a211c;margin:8px 0 6px;">${esc(p.title)}<span style="color:#e8553e;">.</span></div>
      <div style="font:400 12.5px Helvetica,Arial,sans-serif;color:#74685e;margin:0 0 16px;">${esc(p.source)}</div>
      <a href="${esc(https(p.url))}" style="display:block;padding:14px;border-radius:999px;background:#2a211c;color:#f7f1e8;font:600 15px Helvetica,Arial,sans-serif;text-align:center;text-decoration:none;">Cook this one</a>
      <a href="${SITE}/" style="display:block;padding:10px 8px 0;font:600 13.5px Helvetica,Arial,sans-serif;color:#74685e;text-align:center;text-decoration:none;">Not feeling it? Swipe for another</a>
    </td></tr></table></td></tr>`;

  const people = d.people.length ? card(h2("Keeps this week") + d.people.map((pp, i) => `
    ${i ? `<div style="height:1px;background:#e9dfd2;margin:16px 0;"></div>` : ""}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${avatar(pp.name, pp.color, 32)}
      <td style="padding-left:10px;font:400 14.5px Helvetica,Arial,sans-serif;color:#2a211c;"><b>${esc(pp.name)}</b> kept ${pp.n} this week</td>
      <td align="right"><a href="${SITE}/${esc(encodeURIComponent(pp.key))}" style="font:600 13px Helvetica,Arial,sans-serif;color:#c4402b;text-decoration:none;">See all</a></td></tr></table>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px;"><tr>
      ${pp.recipes.slice(0, 3).map((r) => `<td width="33%" valign="top" style="padding-right:8px;"><a href="${esc(https(r.url))}" style="text-decoration:none;color:#2a211c;"><img src="${esc(https(r.image))}" alt="" width="100" height="100" style="display:block;width:100%;max-width:100px;height:100px;object-fit:cover;border-radius:12px;"><div style="font:600 12px/1.25 Helvetica,Arial,sans-serif;margin-top:5px;">${esc(r.title)}</div></a></td>`).join("")}
      ${"<td width=\"33%\"></td>".repeat(Math.max(0, 3 - pp.recipes.length))}
    </tr></table>`).join("")) : "";

  const n = d.new_follower_count;
  const followers = n ? card(h2(`${n} new follower${n === 1 ? "" : "s"}`) + d.new_followers.map((f, i) => `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="${i < d.new_followers.length - 1 ? "border-bottom:1px solid #e9dfd2;" : ""}"><tr>
      <td style="padding:9px 0;" width="34"><table role="presentation" cellpadding="0" cellspacing="0"><tr>${avatar(f.name, f.color, 34)}</tr></table></td>
      <td style="padding:9px 10px;font:600 14.5px Helvetica,Arial,sans-serif;color:#2a211c;">${esc(f.name)}<div style="font:400 12px Helvetica,Arial,sans-serif;color:#74685e;">Followed you ${esc(weekday(f.at))}</div></td>
      <td align="right" style="padding:9px 0;">${f.follows_back
        ? `<a href="${SITE}/?view=followers" style="display:inline-block;padding:8px 14px;border-radius:999px;border:1.5px solid #3f9b6b;color:#2f7a52;font:600 13px Helvetica,Arial,sans-serif;text-decoration:none;">Following</a>`
        : `<a href="${SITE}/?follow=${esc(f.user_id)}" style="display:inline-block;padding:8px 14px;border-radius:999px;background:#2a211c;color:#f7f1e8;font:600 13px Helvetica,Arial,sans-serif;text-decoration:none;">Follow back</a>`}</td>
    </tr></table>`).join("") + `
    <a href="${SITE}/?view=followers" style="display:block;margin-top:10px;padding:12px;border-radius:14px;background:#f7f1e8;color:#2a211c;font:600 14px Helvetica,Arial,sans-serif;text-align:center;text-decoration:none;">See all ${d.follower_total} follower${d.follower_total === 1 ? "" : "s"}</a>`, "20px 18px 14px") : "";

  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>forks.</title></head>
<body style="margin:0;padding:0;background:#f7f1e8;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preview(d))}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f1e8;"><tr><td align="center" style="padding:20px 16px 28px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:420px;">
  <tr><td style="padding:0 4px 18px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td style="font:700 24px Georgia,'Times New Roman',serif;color:#2a211c;letter-spacing:-0.5px;">forks<span style="color:#e8553e;">.</span></td>
    <td align="right" style="font:400 12px Helvetica,Arial,sans-serif;color:#74685e;">${esc(dateLine())}</td></tr></table></td></tr>
  ${hero}${people}${followers}
  <tr><td align="center" style="padding:6px 8px 0;font:400 12px/1.55 Helvetica,Arial,sans-serif;color:#74685e;">
    You&rsquo;re receiving this because you<br>have &ldquo;Sunday dinner pick&rdquo; turned on<br><br>
    <a href="${unsub}" style="color:#74685e;">Turn it off</a> &middot; <a href="${SITE}/privacy.html" style="color:#74685e;">Privacy</a><br><br>
    Forks is made with &#10084;&#65039; for Kelly
  </td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    `Your dinner this week: ${p.title}${p.with_name ? ` (you and ${p.with_name} both kept it)` : ""}`,
    https(p.url), "",
    ...d.people.map((pp) => `${pp.name} kept ${pp.n} this week: ${pp.recipes.map((r) => r.title).join(", ")}`),
    ...(n ? ["", `${n} new follower${n === 1 ? "" : "s"}: ${d.new_followers.map((f) => f.name).join(", ")}. See them: ${SITE}/?view=followers`] : []),
    "", `Turn off Sunday dinner pick: ${unsub}`,
  ].join("\n");

  return { subject: `This week: ${p.title}`, preview: preview(d), html, text, unsub };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const key = Deno.env.get("SUNDAY_KEY");
  if (!key || req.headers.get("x-forks-key") !== key) return json({ error: "forbidden" }, 403);
  const body = await req.json().catch(() => ({}));
  const dry = !!body.dry;
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  let ids: string[] = Array.isArray(body.user_ids) ? body.user_ids.filter((x: unknown) => typeof x === "string").slice(0, 50) : [];
  if (!ids.length) {
    const since = new Date(Date.now() - 6 * 86400e3).toISOString();
    const [{ data: profiles }, { data: prefs }] = await Promise.all([
      db.from("meals_profiles").select("user_id"),
      db.from("meals_email_prefs").select("user_id, sunday_pick, last_sent_at"),
    ]);
    const pref = new Map((prefs ?? []).map((r) => [r.user_id, r]));
    ids = (profiles ?? []).map((r) => r.user_id).filter((id) => {
      const p = pref.get(id);
      return !p || (p.sunday_pick && (!p.last_sent_at || p.last_sent_at < since));
    });
  }

  const results: unknown[] = [];
  for (const uid of ids) {
    // Make sure there's a prefs row (it holds the unsubscribe token); doesn't change anyone's opt-in.
    await db.from("meals_email_prefs").upsert({ user_id: uid }, { onConflict: "user_id", ignoreDuplicates: true });
    const { data: d, error } = await db.rpc("meals_sunday_digest", { p_user: uid });
    if (error || !d) { results.push({ user: uid, skipped: error?.message ?? "no profile" }); continue; }
    const digest = d as Digest;
    if (!digest.pick || !digest.email) { results.push({ user: uid, skipped: "nothing to pick" }); continue; }
    const mail = render(digest);
    if (dry) { results.push({ user: uid, subject: mail.subject, preview: mail.preview, html: mail.html }); continue; }
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: FROM, to: [digest.email], subject: mail.subject, html: mail.html, text: mail.text,
        headers: { "List-Unsubscribe": `<${mail.unsub}>` },
      }),
    });
    if (r.ok) {
      await db.from("meals_email_prefs").update({ last_pick: digest.pick.id, last_sent_at: new Date().toISOString() }).eq("user_id", uid);
      results.push({ user: uid, sent: true, subject: mail.subject });
    } else {
      results.push({ user: uid, sent: false, status: r.status, error: (await r.text()).slice(0, 200) });
    }
  }
  return json({ count: results.length, results });
});
