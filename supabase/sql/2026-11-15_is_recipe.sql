-- Applied 2026-11-15. Keep blog/lifestyle posts (Half Baked Harvest "Nine Favorite Things", meal plans, gift guides,
-- barn posts...) out of the deck. null = not checked yet, true = recipe, false = not a recipe.
-- Set by meals-enrich (page JSON-LD / microdata / measurements; for Half Baked Harvest, its WordPress categories).
alter table public.meals_recipes add column if not exists is_recipe boolean;
update public.meals_recipes set is_recipe = true where ingredients is not null and is_recipe is null;

-- meals_deck (the 5-arg version the app calls) gains: and r.is_recipe is not false
-- meals_sources gains the same filter so the sources page counts only recipes.
