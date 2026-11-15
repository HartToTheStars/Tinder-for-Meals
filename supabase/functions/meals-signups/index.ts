// Daily signup alert for the owner: one short email listing anyone who made an account since the
// last check. Nothing is sent on days with no signups. Called by pg_cron (meals_send_signup_alert)
// at 7am Pacific with header x-forks-key (same server-only key as the Sunday email).
// POST { dry?: boolean } — dry returns what would be sent and doesn't move the "since" marker.
// Recipient and marker live in meals_internal: signup_alert_to, signup_alert_since.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const FROM = Deno.env.get("MAIL_FROM") ?? "forks <hello@forkslist.com>";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const when = (iso: string) => new Date(iso).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" }) + " PT";

type Signup = { email: string; name: string | null; at: string };

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: rows } = await db.from("meals_internal").select("name, value").in("name", ["sunday_key", "signup_alert_to", "signup_alert_since"]);
  const cfg = Object.fromEntries((rows ?? []).map((r) => [r.name, r.value]));
  if (!cfg.sunday_key || req.headers.get("x-forks-key") !== cfg.sunday_key) return json({ error: "forbidden" }, 403);
  if (!cfg.signup_alert_to) return json({ error: "no recipient" }, 500);
  const body = await req.json().catch(() => ({}));

  const now = new Date().toISOString();
  const since = cfg.signup_alert_since || new Date(Date.now() - 86400e3).toISOString();
  const { data, error } = await db.rpc("meals_new_signups", { p_since: since });
  if (error) return json({ error: error.message }, 500);
  const users = (data?.users ?? []) as Signup[];
  const total = Number(data?.total ?? 0);

  if (!users.length) {
    if (!body.dry) await db.from("meals_internal").update({ value: now }).eq("name", "signup_alert_since");
    return json({ sent: false, new: 0, total });
  }

  const n = users.length;
  const subject = `forks: ${n} new signup${n === 1 ? "" : "s"}`;
  const rowsHtml = users.map((u) => `<tr><td style="padding:8px 0;border-bottom:1px solid #e9dfd2;font:600 14px Helvetica,Arial,sans-serif;color:#2a211c;">${esc(u.name || "No name yet")}<div style="font:400 12.5px Helvetica,Arial,sans-serif;color:#74685e;">${esc(u.email)} &middot; ${esc(when(u.at))}</div></td></tr>`).join("");
  const html = `<!doctype html><html><body style="margin:0;background:#f7f1e8;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f1e8;"><tr><td align="center" style="padding:20px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:420px;background:#fffdf9;border:1px solid #e9dfd2;border-radius:20px;"><tr><td style="padding:20px 18px;">
<div style="font:700 21px Georgia,serif;color:#2a211c;margin:0 0 4px;">${n} new signup${n === 1 ? "" : "s"}<span style="color:#e8553e;">.</span></div>
<div style="font:400 13px Helvetica,Arial,sans-serif;color:#74685e;margin:0 0 10px;">${total} accounts total.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rowsHtml}</table>
</td></tr></table></td></tr></table></body></html>`;
  const text = [`${n} new signup${n === 1 ? "" : "s"} on forks (${total} accounts total):`, "", ...users.map((u) => `${u.name || "No name yet"} <${u.email}>, ${when(u.at)}`)].join("\n");

  if (body.dry) return json({ dry: true, subject, text });
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "content-type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [cfg.signup_alert_to], subject, html, text }),
  });
  if (!r.ok) return json({ sent: false, status: r.status, error: (await r.text()).slice(0, 200) }, 502);
  await db.from("meals_internal").update({ value: now }).eq("name", "signup_alert_since");
  return json({ sent: true, new: n, total });
});
