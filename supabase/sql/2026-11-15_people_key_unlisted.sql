-- Applied 2026-11-15. Unlisted profiles only resolve by share_code (meals_profile_card / meals_public_keeps),
-- but meals_people and meals_kept_by handed the client the first-name handle, so tapping a followed
-- unlisted person opened an empty list. Return share_code as the lookup key for non-public profiles.
CREATE OR REPLACE FUNCTION public.meals_people(p_ids uuid[] DEFAULT '{}'::uuid[])
 RETURNS TABLE(user_id uuid, handle text, name text, keeps bigint, is_featured boolean)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select p.user_id, case when p.is_public then p.handle else p.share_code end, p.name,
    (select count(*) from meals_user_swipes s where s.user_id = p.user_id and s.liked), p.is_featured
  from meals_profiles p
  where (p.is_public and p.is_featured)
     or p.user_id = any(coalesce(p_ids, '{}'))
     or p.user_id in (select followee from meals_follows where follower = auth.uid())
  order by p.is_featured desc, p.name;
$function$;

CREATE OR REPLACE FUNCTION public.meals_kept_by(p_ids uuid[], p_follows uuid[] DEFAULT '{}'::uuid[])
 RETURNS TABLE(recipe_id uuid, total bigint, people json)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  with mine as (
    select followee from meals_follows where follower = auth.uid()
    union select unnest(coalesce(p_follows, '{}'))
  )
  select s.recipe_id,
    case when count(*) >= 3 then count(*) else 0 end,
    coalesce(json_agg(json_build_object('handle', case when p.is_public then p.handle else p.share_code end, 'name', p.name, 'color', p.color))
      filter (where p.user_id is not null and p.user_id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000')), '[]')
  from meals_user_swipes s
  left join meals_profiles p on p.user_id = s.user_id
    and ((p.is_public and p.is_featured) or p.user_id in (select followee from mine))
  where s.liked and s.recipe_id = any(p_ids)
  group by s.recipe_id;
$function$;
