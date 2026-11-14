// DELETE with the signed-in user's access token: erases the account. Swipes go with it (on delete cascade).
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
  "access-control-allow-methods": "DELETE, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "DELETE") return new Response("method", { status: 405, headers: cors });
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return new Response(JSON.stringify({ error: "not_signed_in" }), { status: 401, headers: cors });
  const { error: delErr } = await db.auth.admin.deleteUser(data.user.id);
  if (!delErr && data.user.email) await db.from("meals_auth_sends").delete().ilike("email", data.user.email);
  if (delErr) return new Response(JSON.stringify({ error: "delete_failed" }), { status: 500, headers: cors });
  return new Response(JSON.stringify({ deleted: true }), { headers: { ...cors, "content-type": "application/json" } });
});
