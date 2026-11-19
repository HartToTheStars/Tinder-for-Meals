-- Anonymous first-party usage events for test-and-learn (see marketing/PLAYBOOK.md).
create table if not exists public.meals_events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  name text not null check (name ~ '^[a-z_]{2,32}$'),
  path text check (char_length(path) <= 200),
  did text check (char_length(did) <= 40),
  exp text check (char_length(exp) <= 200),
  ref text check (char_length(ref) <= 100),
  host text check (char_length(host) <= 60),
  props jsonb check (pg_column_size(props) <= 1000)
);
create index if not exists meals_events_at_idx on public.meals_events (at);
create index if not exists meals_events_name_at_idx on public.meals_events (name, at);
alter table public.meals_events enable row level security;
revoke all on public.meals_events from anon, authenticated;
grant insert (name, path, did, exp, ref, host, props) on public.meals_events to anon, authenticated;
create policy meals_events_insert on public.meals_events for insert to anon, authenticated with check (true);
