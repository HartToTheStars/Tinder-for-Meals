-- Applied to the side-quests project on 2026-11-14.
-- Let a signed-in user share (or unshare) their own keeps. Profiles stay private by default.
create or replace function public.meals_set_public(p_public boolean)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare uid uuid := auth.uid(); out json;
begin
  if uid is null then raise exception 'not signed in'; end if;
  update meals_profiles set is_public = coalesce(p_public, false) where user_id = uid;
  if not found then raise exception 'name required'; end if;
  select json_build_object('handle', handle, 'name', name, 'color', color, 'is_public', is_public)
    into out from meals_profiles where user_id = uid;
  return out;
end $$;
revoke all on function public.meals_set_public(boolean) from public, anon;
grant execute on function public.meals_set_public(boolean) to authenticated;
