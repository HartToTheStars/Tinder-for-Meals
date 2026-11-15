-- Applied 2026-11-15. Weekly harvest via pg_cron + pg_net.
-- meals_call_fn POSTs to an edge function with the public anon key (the same one app.js ships; see tools/og/render.js).
create extension if not exists pg_cron;

create or replace function public.meals_call_fn(p_fn text) returns bigint
language sql security definer set search_path to 'public' as $$
  select net.http_post(
    url := 'https://dmwsylofgfocmbqvmgfe.supabase.co/functions/v1/' || p_fn,
    headers := jsonb_build_object('content-type', 'application/json', 'authorization', 'Bearer <ANON KEY>'),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000);
$$;
revoke all on function public.meals_call_fn(text) from public, anon, authenticated;

-- Mondays 09:17 UTC: harvest. Then enrich in 40-recipe batches every 15 min for 4 hours (up to 640 rows).
select cron.schedule('meals-harvest-weekly', '17 9 * * 1', $$select public.meals_call_fn('meals-harvest')$$);
select cron.schedule('meals-enrich-after-harvest', '*/15 10-13 * * 1', $$select public.meals_call_fn('meals-enrich')$$);
-- Check runs: select * from cron.job_run_details order by start_time desc limit 10;
--             select id, status_code, left(content, 300) from net._http_response order by id desc limit 10;
