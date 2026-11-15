// "Suggest a site" form on /sources.html.
// POST { url, note?, email?, company? (honeypot) }
// Stores the suggestion in meals_suggestions and emails it to Andrew through Resend
// (secret RESEND_API_KEY; sender hello@forkslist.com via MAIL_FROM; recipient SUGGEST_TO).
// Limits: 3 per hour per IP, 40 per day overall, so the form can't be used as a mail cannon.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const TO = Deno.env.get("SUGGEST_TO") ?? "andrew.r.hartman@gmail.com";
const FROM = Deno.env.get("MAIL_FROM") ?? "forks <hello@forkslist.com>";
const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const SITE_OK = /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(\/\S*)?$/i;
const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

async function sha(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const body = await req.json().catch(() => ({}));
  // Bots fill every field; people never see this one. Pretend it worked.
  if (typeof body.company === "string" && body.company.trim()) return json({ ok: true });

  const url = String(body.url ?? "").trim().slice(0, 300);
  const note = String(body.note ?? "").trim().slice(0, 1000);
  const email = String(body.email ?? "").trim().slice(0, 200);
  if (!SITE_OK.test(url)) return json({ error: "That doesn't look like a website. Try something like recipetineats.com." }, 400);
  if (email && !EMAIL_OK.test(email)) return json({ error: "Double-check that email, or leave it blank." }, 400);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const ipHash = await sha(`forks-suggest:${ip}`);
  const hourAgo = new Date(Date.now() - 3600e3).toISOString();
  const dayAgo = new Date(Date.now() - 86400e3).toISOString();
  const [{ count: mine }, { count: all }] = await Promise.all([
    db.from("meals_suggestions").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("created_at", hourAgo),
    db.from("meals_suggestions").select("id", { count: "exact", head: true }).gte("created_at", dayAgo),
  ]);
  if ((mine ?? 0) >= 3 || (all ?? 0) >= 40) return json({ error: "Thanks! That's plenty for now. Try again a bit later." }, 429);

  const { data: row, error } = await db.from("meals_suggestions")
    .insert({ url, note: note || null, email: email || null, ip_hash: ipHash, user_agent: req.headers.get("user-agent")?.slice(0, 300) ?? null })
    .select("id").single();
  if (error) return json({ error: "Something went wrong. Try again in a minute." }, 500);

  const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  const host = href.replace(/^https?:\/\//i, "").replace(/^www\./i, "").split("/")[0];
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f7f1e8;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f1e8;padding:32px 16px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:460px;background:#fffdf9;border-radius:20px;padding:32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#2a211c;">
<tr><td style="font-family:Georgia,serif;font-size:24px;font-weight:700;">forks<span style="color:#e8553e;">.</span></td></tr>
<tr><td style="padding-top:22px;font-family:Georgia,serif;font-size:20px;font-weight:700;">New site suggestion</td></tr>
<tr><td style="padding-top:10px;font-size:16px;"><a href="${esc(href)}" style="color:#e8553e;font-weight:600;">${esc(host)}</a></td></tr>
${note ? `<tr><td style="padding-top:14px;font-size:15px;line-height:1.55;color:#5c514a;white-space:pre-wrap;">${esc(note)}</td></tr>` : ""}
<tr><td style="padding-top:18px;font-size:13px;color:#8a7d72;">From: ${email ? esc(email) + " (hit reply to answer)" : "anonymous"}</td></tr>
</table></td></tr></table></body></html>`;
  const text = `New site suggestion for forks\n\n${href}\n${note ? `\n${note}\n` : ""}\nFrom: ${email || "anonymous"}`;

  const send = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "content-type": "application/json" },
    body: JSON.stringify({ from: FROM, to: [TO], subject: `Site suggestion: ${host}`, html, text, ...(email ? { reply_to: email } : {}) }),
  });
  if (send.ok) await db.from("meals_suggestions").update({ emailed: true }).eq("id", row.id);
  else console.error("resend", send.status, await send.text());
  // Saved either way; a failed email is visible as emailed=false.
  return json({ ok: true });
});
