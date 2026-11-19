-- Made this! on keeps: when you last made it, how many times, and a private note.
-- Applied as migration meals_made_this on Nov 19, 2026.
alter table public.meals_user_swipes
  add column if not exists made_at timestamptz,
  add column if not exists made_count int not null default 0,
  add column if not exists made_note text check (made_note is null or length(made_note) <= 1000);
