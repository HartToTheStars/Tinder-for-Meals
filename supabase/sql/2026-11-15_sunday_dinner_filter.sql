-- Sunday pick must be a real dinner. category='main' only means "not dessert/appetizer/drink",
-- so breakfasts, breads, sauces, dressings and a few sweets land there. This filter is for the
-- email pick only; the deck is untouched. Who to follow also returns each person's total keeps.
create or replace function public.meals_is_dinner(t text) returns boolean language sql immutable as $$
  select not (
    t ~* '(pancake|waffle|french toast|scone|muffin|biscuit|cornbread|corn bread|\mbreads?\M|\mrolls\M|\mbuns\M|croissant|granola|smoothie|oatmeal|porridge|\mtwists?\M|\mknots?\M|\mbites\M|stuffing|breakfast|brunch|egg bake|poach|\mtoasts?\M|\mjam\M|\mbark\M|eggs? (florentine|benedict)|frittata|quiche|crepes?\M|churros?|shortcakes?|cupcakes?|cheesecake|coffee cake|cookies?\M|oreos?\M|\mthins\M|\mcrisps\M|charoset|nacho fries)'
    or (t ~* '(sauce|dressing|pesto|salsa|slaw|dip|hummus|guacamole|syrup|butter|chips|crackers|spread|relish|chutney|mayo|aioli|vinaigrette)\.?$'
        and t !~* ' with ' and array_length(regexp_split_to_array(trim(t), '\s+'), 1) <= 5))
$$;

create or replace function public.meals_sunday_digest(p_user uuid)
 returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  me record; prefs record; pick jsonb; people jsonb; fol jsonb; sugg jsonb; new_n int; total_n int;
begin
  select p.name, p.color, u.email into me from meals_profiles p join auth.users u on u.id = p.user_id where p.user_id = p_user;
  if me is null then return null; end if;
  select * into prefs from meals_email_prefs where user_id = p_user;

  select jsonb_build_object('id', r.id, 'title', r.title, 'source', r.source, 'url', r.url, 'image', r.image,
           'with_name', x.with_name, 'with_color', x.with_color)
    into pick
  from (
    select k.recipe_id, fp.name with_name, fp.color with_color, max(fs.swiped_at) t
    from meals_user_swipes k
    join meals_user_swipes fs on fs.recipe_id = k.recipe_id and fs.liked
      and fs.user_id in (select followee from meals_follows where follower = p_user)
    join meals_profiles fp on fp.user_id = fs.user_id
    where k.user_id = p_user and k.liked
    group by k.recipe_id, fp.name, fp.color
  ) x join meals_recipes r on r.id = x.recipe_id
  where r.image is not null and r.is_recipe is not false and not r.is_roundup
    and r.category = 'main' and meals_is_dinner(r.title) and r.id is distinct from prefs.last_pick
  order by x.t desc nulls last, random() limit 1;

  if pick is null then
    select jsonb_build_object('id', r.id, 'title', r.title, 'source', r.source, 'url', r.url, 'image', r.image)
      into pick
    from meals_user_swipes k join meals_recipes r on r.id = k.recipe_id
    where k.user_id = p_user and k.liked and r.image is not null and r.is_recipe is not false and not r.is_roundup
      and r.category = 'main' and meals_is_dinner(r.title) and r.id is distinct from prefs.last_pick
    order by random() limit 1;
  end if;
  if pick is null then
    select jsonb_build_object('id', r.id, 'title', r.title, 'source', r.source, 'url', r.url, 'image', r.image)
      into pick
    from meals_recipes r
    where r.image is not null and r.is_recipe is not false and not r.is_roundup
      and r.category = 'main' and meals_is_dinner(r.title)
      and r.id not in (select recipe_id from meals_user_swipes where user_id = p_user)
    order by random() limit 1;
  end if;

  select coalesce(jsonb_agg(person order by n desc), '[]'::jsonb) into people from (
    select jsonb_build_object(
      'name', fp.name, 'color', fp.color, 'n', w.n,
      'key', case when fp.is_public then fp.handle else fp.share_code end,
      'recipes', (select coalesce(jsonb_agg(jsonb_build_object('title', r.title, 'url', r.url, 'image', r.image) order by s.swiped_at desc), '[]'::jsonb)
                  from (select recipe_id, swiped_at from meals_user_swipes where user_id = fp.user_id and liked and swiped_at >= now() - interval '7 days'
                        order by swiped_at desc limit 12) s
                  join meals_recipes r on r.id = s.recipe_id
                  where r.image is not null and r.is_recipe is not false and not r.is_roundup)
    ) person, w.n
    from (select s.user_id, count(*) n from meals_user_swipes s
          where s.liked and s.swiped_at >= now() - interval '7 days'
            and s.user_id in (select followee from meals_follows where follower = p_user)
          group by s.user_id) w
    join meals_profiles fp on fp.user_id = w.user_id
    order by w.n desc limit 3
  ) t;

  select count(*) into new_n from meals_follows where followee = p_user and created_at >= now() - interval '7 days';
  select count(*) into total_n from meals_follows where followee = p_user;
  select coalesce(jsonb_agg(f order by t desc), '[]'::jsonb) into fol from (
    select jsonb_build_object('user_id', f.follower, 'name', coalesce(p.name, 'Someone'), 'color', p.color, 'at', f.created_at,
             'follows_back', exists (select 1 from meals_follows b where b.follower = p_user and b.followee = f.follower)) f, f.created_at t
    from meals_follows f left join meals_profiles p on p.user_id = f.follower
    where f.followee = p_user and f.created_at >= now() - interval '7 days'
    order by f.created_at desc limit 3
  ) z;

  -- Who to follow: the 3 most-followed public profiles you don't follow yet, with follower and keep totals.
  select coalesce(jsonb_agg(s order by c desc), '[]'::jsonb) into sugg from (
    select jsonb_build_object('user_id', p.user_id, 'name', p.name, 'color', p.color, 'key', p.handle,
             'followers', (select count(*) from meals_follows x where x.followee = p.user_id),
             'keeps', (select count(*) from meals_user_swipes k where k.user_id = p.user_id and k.liked)) s,
           (select count(*) from meals_follows x where x.followee = p.user_id) c
    from meals_profiles p
    where p.is_public and p.name is not null and p.user_id <> p_user
      and p.user_id not in (select followee from meals_follows where follower = p_user)
    order by c desc, p.created_at
    limit 3
  ) q;

  return jsonb_build_object('name', me.name, 'color', me.color, 'email', me.email, 'unsub_token', prefs.unsub_token,
    'pick', pick, 'people', people, 'new_followers', fol, 'new_follower_count', new_n, 'follower_total', total_n,
    'suggestions', sugg);
end;
$function$;
revoke all on function public.meals_sunday_digest(uuid) from public, anon, authenticated;

-- Applied as migration meals_is_dinner_starters: starters that were filed as main.
-- Adds to meals_is_dinner's exclusions: titles starting with "burrata", caprese, crostini,
-- bruschetta, board(s), platter, melon. Keeps e.g. "Burrata Cheese Stuffed Spicy Meatball Subs".
--   or t ~* '(^\s*burrata|caprese|crostini|bruschetta|\mboards?\M|platter|\mmelon)'
