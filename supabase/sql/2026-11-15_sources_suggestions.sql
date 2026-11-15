-- Applied 2026-11-15. /sources.html: live per-source counts + "Suggest a site" storage (written by meals-suggest).
create or replace function public.meals_sources()
returns table(source text, recipes bigint)
language sql stable security definer set search_path to 'public' as $$
  select source, count(*) from meals_recipes where coalesce(is_roundup, false) = false group by source order by count(*) desc;
$$;
grant execute on function public.meals_sources() to anon, authenticated;

create table if not exists public.meals_suggestions (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  note text,
  email text,
  ip_hash text,
  user_agent text,
  emailed boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.meals_suggestions enable row level security;
create index if not exists meals_suggestions_ip_time on public.meals_suggestions (ip_hash, created_at desc);
