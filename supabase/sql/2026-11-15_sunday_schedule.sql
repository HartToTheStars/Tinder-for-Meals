-- Applied as migration meals_sunday_schedule.
-- Sunday dinner pick goes out every Sunday at 5am Pacific. pg_cron runs in UTC, so it fires at
-- 12:00 and 13:00 UTC and meals_send_sunday() only calls the sender when it's 5am in Los Angeles
-- (12:00 UTC in daylight time, 13:00 UTC in standard time). The sender itself skips anyone
-- emailed in the last 6 days, so a double fire can never double-send.
create or replace function public.meals_send_sunday() returns bigint
language plpgsql security definer set search_path to 'public' as $$
begin
  if extract(hour from now() at time zone 'America/Los_Angeles') <> 5 then return null; end if;
  return net.http_post(
    url := 'https://dmwsylofgfocmbqvmgfe.supabase.co/functions/v1/meals-sunday',
    headers := jsonb_build_object('content-type', 'application/json',
      'authorization', 'Bearer <anon key>',
      'x-forks-key', (select value from meals_internal where name = 'sunday_key')),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000);
end $$;
revoke all on function public.meals_send_sunday() from public, anon, authenticated;
select cron.schedule('meals-sunday-pick', '0 12,13 * * 0', 'select public.meals_send_sunday()');
