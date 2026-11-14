-- Multi-tenant swipes. Existing swipes go to Kelly. (Pending approval in Supabase.)

-- 1. Swipes belong to a user.
alter table public.meals_swipes add column if not exists user_id uuid references auth.users(id) on delete cascade;
update public.meals_swipes set user_id = (select id from auth.users where email = 'thekellyhartman@gmail.com') where user_id is null;
alter table public.meals_swipes alter column user_id set not null;
alter table public.meals_swipes alter column user_id set default auth.uid();
alter table public.meals_swipes drop constraint meals_swipes_pkey;
alter table public.meals_swipes add primary key (user_id, recipe_id);
create index if not exists meals_swipes_user_liked_idx on public.meals_swipes(user_id, liked, swiped_at desc);

drop policy if exists "meals swipes read" on public.meals_swipes;
drop policy if exists "meals swipes insert" on public.meals_swipes;
drop policy if exists "meals swipes update" on public.meals_swipes;
drop policy if exists "meals swipes delete" on public.meals_swipes;
create policy "own swipes read" on public.meals_swipes for select to authenticated using (user_id = (select auth.uid()));
create policy "own swipes insert" on public.meals_swipes for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own swipes update" on public.meals_swipes for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own swipes delete" on public.meals_swipes for delete to authenticated using (user_id = (select auth.uid()));

-- 2. Per-user taste, computed on the fly from the signed-in user's swipes plus any guest swipes passed in.
create or replace function public.meals_weights(p_liked uuid[] default '{}', p_noped uuid[] default '{}')
returns table (token text, likes bigint, weight double precision)
language sql stable security invoker set search_path = public as $$
  with sw as (
    select recipe_id, liked from meals_swipes where user_id = auth.uid()
    union all select unnest(coalesce(p_liked, '{}')), true
    union all select unnest(coalesce(p_noped, '{}')), false
  ), toks as (
    select unnest(meals_tokens(r.title, r.source)) as token, sw.liked
    from sw join meals_recipes r on r.id = sw.recipe_id
  ), agg as (
    select token, count(*) filter (where liked) l, count(*) filter (where not liked) n from toks group by token
  )
  select token, l, ln((l + 1.0) / (n + 1.0)) * ((l + n)::float / (l + n + 2)) from agg;
$$;
grant execute on function public.meals_weights(uuid[], uuid[]) to anon, authenticated;

create or replace function public.meals_taste_top(p_liked uuid[] default '{}', p_noped uuid[] default '{}')
returns json language sql stable security invoker set search_path = public as $$
  select json_build_object('top', coalesce(json_agg(token order by weight desc), '[]'))
  from (select token, weight from meals_weights(p_liked, p_noped) where likes >= 2 and weight > 0.2 order by weight desc limit 3) x;
$$;
grant execute on function public.meals_taste_top(uuid[], uuid[]) to anon, authenticated;

-- 3. Deck for guests (swipes passed in) or signed-in users (swipes from the table).
create or replace function public.meals_deck(n int, cat text, want text[], p_liked uuid[] default '{}', p_noped uuid[] default '{}')
returns setof public.meals_recipes
language sql stable security invoker set search_path = public as $$
  with w as (select token, weight from meals_weights(p_liked, p_noped)),
  seen as (
    select recipe_id from meals_swipes where user_id = auth.uid()
    union select unnest(coalesce(p_liked, '{}')) union select unnest(coalesce(p_noped, '{}'))
  ), cand as (
    select r.id, meals_tokens(r.title, r.source) as toks
    from meals_recipes r
    where r.image is not null
      and r.id not in (select recipe_id from seen where recipe_id is not null)
      and (cat is null or r.category = cat)
      and (want is null or cardinality(want) = 0 or r.tags @> want)
  ), scored as (
    select c.id, coalesce((select sum(w.weight) from w where w.token = any(c.toks)), 0) / sqrt(greatest(cardinality(c.toks), 1)) as score
    from cand c
  )
  select r.* from meals_recipes r join scored s on s.id = r.id
  order by s.score + random() * 0.6 desc
  limit least(greatest(n, 1), 50);
$$;
grant execute on function public.meals_deck(int, text, text[], uuid[], uuid[]) to anon, authenticated;

-- 4. The old global taste writer is retired from the API.
revoke execute on function public.meals_refine() from anon, authenticated, public;

-- 5. Auth helpers for the meals-auth function (service role only).
create or replace function public.meals_user_exists(p_email text) returns boolean
language sql stable security definer set search_path = public, auth as $$
  select exists (select 1 from auth.users where lower(email) = lower(p_email));
$$;
revoke execute on function public.meals_user_exists(text) from public, anon, authenticated;
grant execute on function public.meals_user_exists(text) to service_role;

create table if not exists public.meals_auth_sends (
  id bigint generated always as identity primary key,
  email text not null,
  sent_at timestamptz not null default now()
);
alter table public.meals_auth_sends enable row level security;
create index if not exists meals_auth_sends_email_idx on public.meals_auth_sends(lower(email), sent_at desc);
