-- Applied as migrations meals_swipe_together and meals_swipe_together_code.
-- "Swipe with someone": a host starts a round of 12 dinners (main + meals_is_dinner, with images,
-- skipping ones the host already noped) and shares forkslist.com/?with=<code>. Anyone with the link
-- swipes the same 12, no account needed. Matches = recipes every finished participant kept, shown
-- once at least two people have finished. Rounds expire after 7 days; max 8 people per round.
-- Tables meals_together, meals_together_votes have RLS on and no policies: access is only through
--   meals_together_create(p_participant uuid, p_name text) -> code (8 hex chars)
--   meals_together_vote(p_code, p_participant, p_name, p_recipe, p_liked) -> bool
--   meals_together_get(p_code, p_participant) -> jsonb {code, host_name, is_host, total, recipes,
--     people[{name,n,me}], mine{recipe_id: liked}, done, matches[recipe_id]} or null
-- Participants are a random id each device keeps per round (plus user_id when signed in).

-- Applied as migrations meals_together_full and meals_together_cap_8 (2026-11-16):
-- A round holds exactly 8: the host (always allowed, even after it fills) plus up to 7 others.
-- meals_together_vote refuses a newcomer once 7 non-host people have swiped.
-- meals_together_get adds 'full': true for a newcomer when the round is at capacity, so the
-- app shows "This round is full" before they start swiping.

-- Applied as migration meals_together_timers (2026-11-16):
-- 60-second swipe timers. Table meals_together_timers(together_id, participant, deadline), RLS on,
-- no policies. meals_together_timer(p_code, p_participant) starts or restarts a person's timer
-- (deadline = now + 62s, 2s grace) and respects the 8-person cap. meals_together_get adds
-- 'waiting' = others whose timer is running and who haven't finished their 12.

-- Applied as migration meals_together_end (2026-11-16):
-- meals_together.ended_at; meals_together_end(p_code, p_participant) lets the host end a round.
-- Ended rounds refuse votes and timers; meals_together_get adds 'ended' and reports waiting = 0.

-- Applied as migration meals_together_idle (2026-11-19): meals_together_get adds 'idle_minutes', minutes
-- since anyone created the round, swiped, or started a timer. The app starts a fresh round at 120.
