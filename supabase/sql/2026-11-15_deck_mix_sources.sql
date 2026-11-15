-- Applied 2026-11-15. Andrew's deck was ~16 of 20 Half Baked Harvest: his keeps gave src:Half Baked Harvest +0.36 vs
-- -0.46 for Bon Appétit, a gap bigger than the 0.6 random jitter. Now the source token counts for 35% (title words
-- drive taste) and each further card from the same source in a batch ranks 0.08 lower. Simulated on his history:
-- ~8 / 6 / 6 per 20, favorite source still leads.
CREATE OR REPLACE FUNCTION public.meals_deck(n integer, cat text, want text[], p_liked uuid[] DEFAULT '{}'::uuid[], p_noped uuid[] DEFAULT '{}'::uuid[])
 RETURNS SETOF meals_recipes
 LANGUAGE sql STABLE SET search_path TO 'public'
AS $function$
  with w as (
    select token, weight * case when token like 'src:%' then 0.35 else 1 end as weight
    from meals_weights(p_liked, p_noped)
  ),
  seen as (
    select recipe_id from meals_user_swipes where user_id = auth.uid()
    union select unnest(coalesce(p_liked, '{}')) union select unnest(coalesce(p_noped, '{}'))
  ), cand as (
    select r.id, r.source, meals_tokens(r.title, r.source) as toks
    from meals_recipes r
    where r.image is not null
      and not r.is_roundup
      and r.is_recipe is not false
      and r.id not in (select recipe_id from seen where recipe_id is not null)
      and (cat is null or r.category = cat)
      and (want is null or cardinality(want) = 0 or r.tags @> want)
  ), scored as (
    select c.id, c.source,
      coalesce((select sum(w.weight) from w where w.token = any(c.toks)), 0) / sqrt(greatest(cardinality(c.toks), 1))
        + random() * 0.6 as score
    from cand c
  ), mixed as (
    select id, score - 0.08 * (row_number() over (partition by source order by score desc) - 1) as final
    from scored
  )
  select r.* from meals_recipes r join mixed m on m.id = r.id
  order by m.final desc
  limit least(greatest(n, 1), 50);
$function$;
