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

## Diet & lifestyle filters
`meals-enrich` reads each recipe page's ingredient list and cook time (schema.org JSON-LD, or microdata on Smitten Kitchen). `meals_tags()` turns that into a generated `tags` column: `kid`, `quick` (≤30 min), `protein`, `vegetarian`, `vegan`, `gluten-free`, `dairy-free`. Diet tags are only assigned from real ingredient lists or the site's own labels. Half Baked Harvest and The Kitchn block page fetches, so they only get title-based tags (kid, protein). These are best guesses; don't rely on them for allergies or celiac.

## Accounts
- Guests swipe without signing in; their swipes live in `localStorage` (`forks:guest`) and are passed to `meals_deck` / `meals_taste_top` as `p_liked` / `p_noped`.
- On the 3rd swipe (with at least one keep) guests are offered "Don't lose your keeps". "No thanks, just browsing" stops the prompt for good on that device.
- `meals-auth` sends magic links via Resend (secret `RESEND_API_KEY`, sender hello@forkslist.com). New email: account is created and guest swipes are saved immediately. Existing email: a sign-in link is sent; guest swipes merge after the link is opened.
- Links land on `/?login=<token_hash>`; the app calls `verifyOtp` and merges any guest swipes.
- Swipes are per user in `meals_user_swipes` (RLS: own rows only). The old shared `meals_swipes` table is kept as a closed backup; its rows were copied to Kelly.

## Sharing your keeps
Profiles (`meals_profiles`) are private by default (`is_public = false`). The account sheet has a "Share my keeps" switch that calls `meals_set_public(bool)` (own row only; needs a first name, so it asks for one first). A shared list gets a link `/?u=<handle>`, which opens a landing sheet: avatar, keep count, a 3x2 peek at their keeps and a Follow button. Following adds them to "Other keeps". `meals_people` and `meals_public_keeps` only return public profiles, so switching sharing off hides the list from followers too. Recipe share links only carry `by=<handle>` when the sender's list is shared.

## Share previews
`tools/og/render.js` renders 1200x630 preview images (og/<id>.jpg, og/site.jpg) with headless Chromium and writes a share page per recipe at s/<id>/index.html with Open Graph tags. Re-run it after a harvest to cover new recipes, then publish with `python3 tools/publish.py`. Recipes without a page share as /?r=<id> (generic site preview).
