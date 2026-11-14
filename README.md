# forks.

Tinder for meals. Swipe right to keep a recipe, left to pass. Kept recipes live in a searchable list.

- **Frontend:** static `index.html` + `styles.css` + `app.js` (no build step).
- **Data:** Supabase project `side-quests`, tables `meals_recipes` and `meals_swipes`, RPC `meals_deck`.
- **Recipes:** `supabase/functions/meals-harvest` pulls from Smitten Kitchen, Half Baked Harvest, Bon Appétit and The Kitchn (RSS + sitemaps). Food52 blocks server-side fetches, so it's skipped.

Keys: ← pass, → keep, ↑ open recipe, Backspace undo, `/` search.

## Taste model
Every 10 swipes the app calls `meals_refine()`, which recomputes `meals_taste`: a shrunk log-odds weight per title word and per source, built from all keeps vs. passes. `meals_deck()` ranks unseen recipes by summed token weight plus random jitter, so favorites rise and there's still room to discover.

## Courses
`meals_recipes.category` is a generated column from `meals_category()` (keyword rules on the title): `main`, `appetizer`, `dessert`, `drink`. The swipe view filters with `meals_deck(n, sources, cat)`; the choice is remembered per device.
