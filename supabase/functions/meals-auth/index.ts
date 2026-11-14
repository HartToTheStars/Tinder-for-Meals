// Magic-link sign-in for forks.
// POST { email, origin, guest?: { liked: uuid[], noped: uuid[] } }
// - New email: creates the account, saves the guest's swipes to it, emails a "your keeps are saved" link.
// - Existing email: emails a sign-in link. Guest swipes merge client-side after they sign in.
// Emails go out through Resend (secrets: RESEND_API_KEY, MAIL_FROM).
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const DEFAULT_ORIGIN = "https://humble-aura-cbq3.here.now";
const ORIGIN_OK = /^(https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.here\.now|http:\/\/localhost(:\d+)?)$/i;
const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

function emailHtml(kind: "new" | "existing", link: string, keeps: number) {
  const title = kind === "new" ? "Your keeps are saved" : "Sign in to forks";
  const body = kind === "new"
    ? `${keeps ? `We tucked away the ${keeps} recipe${keeps === 1 ? "" : "s"} you kept.` : "Your forks account is ready."} Tap below to confirm it's you and pick up where you left off, on any device.`
    : "Tap below to sign in. Anything you kept while browsing comes with you.";
  const cta = kind === "new" ? "Open my keeps" : "Sign in";
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f7f1e8;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f1e8;padding:40px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:420px;background:#fffdf9;border-radius:20px;padding:36px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#2a211c;">
<tr><td style="font-family:Georgia,'Times New Roman',serif;font-size:26px;font-weight:700;letter-spacing:-0.5px;">forks<span style="color:#e8553e;">.</span></td></tr>
<tr><td style="padding-top:28px;font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:700;">${title}</td></tr>
<tr><td style="padding-top:10px;font-size:15px;line-height:1.55;color:#5c514a;">${body}</td></tr>
<tr><td style="padding-top:26px;"><a href="${link}" style="display:inline-block;background:#2a211c;color:#f7f1e8;text-decoration:none;font-size:15px;font-weight:600;padding:13px 26px;border-radius:999px;">${cta}</a></td></tr>
<tr><td style="padding-top:28px;font-size:12px;line-height:1.5;color:#8a7d72;">This link works once and expires in an hour. If you didn't ask for it, you can ignore this email.</td></tr>
</table>
<p style="font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:12px;color:#8a7d72;margin:18px 0 0;">Made with love for Kelly</p>
</td></tr></table></body></html>`;
}

const emailText = (kind: "new" | "existing", link: string) =>
  (kind === "new" ? "Your forks keeps are saved.\n\nOpen them here:\n" : "Sign in to forks:\n") +
  `${link}\n\nThis link works once and expires in an hour. If you didn't ask for it, ignore this email.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);

  let body: { email?: string; origin?: string; guest?: { liked?: string[]; noped?: string[] } };
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
  const email = (body.email ?? "").trim().toLowerCase();
  if (!EMAIL_OK.test(email) || email.length > 254) return json({ error: "bad_email" }, 400);
  const origin = ORIGIN_OK.test(body.origin ?? "") ? body.origin! : DEFAULT_ORIGIN;

  const key = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("MAIL_FROM");
  if (!key || !from) return json({ error: "email_not_configured" }, 503);

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Throttle: one email per address per 45 seconds.
  const { data: recent } = await db.from("meals_auth_sends").select("sent_at")
    .ilike("email", email).gte("sent_at", new Date(Date.now() - 45_000).toISOString()).limit(1);
  if (recent?.length) return json({ error: "slow_down" }, 429);

  const { data: exists, error: exErr } = await db.rpc("meals_user_exists", { p_email: email });
  if (exErr) return json({ error: "lookup_failed" }, 500);
  const kind: "new" | "existing" = exists ? "existing" : "new";

  const uuid = /^[0-9a-f-]{36}$/i;
  const liked = (body.guest?.liked ?? []).filter((id) => uuid.test(id)).slice(0, 2000);
  const noped = (body.guest?.noped ?? []).filter((id) => uuid.test(id)).slice(0, 5000);

  if (kind === "new") {
    const { data: created, error } = await db.auth.admin.createUser({ email, email_confirm: true });
    if (error || !created.user) return json({ error: "create_failed" }, 500);
    // A brand-new account has nothing to protect, so the guest's swipes can be saved right away.
    const rows = [
      ...liked.map((recipe_id) => ({ user_id: created.user.id, recipe_id, liked: true })),
      ...noped.map((recipe_id) => ({ user_id: created.user.id, recipe_id, liked: false })),
    ];
    if (rows.length) await db.from("meals_swipes").upsert(rows, { onConflict: "user_id,recipe_id", ignoreDuplicates: true });
  }

  const { data: link, error: linkErr } = await db.auth.admin.generateLink({ type: "magiclink", email });
  const hash = link?.properties?.hashed_token;
  if (linkErr || !hash) return json({ error: "link_failed" }, 500);
  const url = `${origin}/?login=${encodeURIComponent(hash)}`;

  const send = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      from, to: [email],
      subject: kind === "new" ? "Your forks keeps are saved" : "Your forks sign-in link",
      html: emailHtml(kind, url, liked.length),
      text: emailText(kind, url),
    }),
  });
  if (!send.ok) return json({ error: "send_failed", detail: (await send.text()).slice(0, 200) }, 502);

  await db.from("meals_auth_sends").insert({ email });
  return json({ status: kind, saved: kind === "new" ? liked.length : 0 });
});
