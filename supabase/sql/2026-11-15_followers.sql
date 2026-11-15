-- Applied 2026-11-15. Followers on your account sheet + follower counts on lists.
-- meals_follows stays private (own rows only); these two functions are the only new ways in.

-- Your followers, newest first, a page at a time: first name, avatar color, when, whether you follow back, total.
-- No share codes or handles are returned.
create or replace function public.meals_my_followers(p_offset integer default 0, p_limit integer default 10)
returns table(user_id uuid, name text, color text, followed_at timestamptz, follows_back boolean, total bigint)
language sql stable security definer set search_path to 'public' as $$
  select f.follower, p.name, p.color, f.created_at,
    exists (select 1 from meals_follows b where b.follower = auth.uid() and b.followee = f.follower),
    count(*) over ()
  from meals_follows f
  left join meals_profiles p on p.user_id = f.follower
  where auth.uid() is not null and f.followee = auth.uid()
  order by f.created_at desc
  offset greatest(coalesce(p_offset, 0), 0)
  limit least(greatest(coalesce(p_limit, 10), 1), 50);
$$;
revoke all on function public.meals_my_followers(integer, integer) from public, anon;
grant execute on function public.meals_my_followers(integer, integer) to authenticated;

-- Follower count for a list, resolved like list links (share code, or handle for public lists).
create or replace function public.meals_follower_count(p_handle text)
returns bigint
language sql stable security definer set search_path to 'public' as $$
  select count(*) from meals_follows f
  join meals_profiles p on p.user_id = f.followee
  where p.share_code = lower(p_handle) or (p.handle = lower(p_handle) and p.is_public);
$$;
grant execute on function public.meals_follower_count(text) to anon, authenticated;
