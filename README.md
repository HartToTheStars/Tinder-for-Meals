# forks.

Tinder for meals. Swipe right to keep a recipe, left to pass. Kept recipes live in a searchable list.

- **Frontend:** static `index.html` + `styles.css` + `app.js` (no build step).
- **Data:** Supabase project `side-quests`, tables `meals_recipes` and `meals_swipes`, RPC `meals_deck`.
- **Recipes:** `supabase/functions/meals-harvest` pulls from Smitten Kitchen, Half Baked Harvest, Bon Appétit and The Kitchn (RSS + sitemaps; The Kitchn's RSS is only its 20 latest posts, mostly shopping and news, so its recipes come from the monthly sitemaps filtered to `-recipe-<id>` URLs). Food52 blocks server-side fetches, so it's skipped. Runs weekly (Mondays 09:17 UTC) via pg_cron, with `meals-enrich` every 15 min for the 4 hours after; see `supabase/sql/2026-11-15_weekly_harvest.sql`. Share images (`tools/og/render.js`) are still a manual step.

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

## Share previews
`tools/og/render.js` renders 1200x630 preview images (og/<id>.jpg, og/site.jpg) with headless Chromium and writes a share page per recipe at s/<id>/index.html with Open Graph tags. Re-run it after a harvest to cover new recipes, then publish with `python3 tools/publish.py`. Recipes without a page share as /?r=<id> (generic site preview).

## Profile links
Every profile has a random `share_code` (3 letters + 4 digits). `forkslist.com/<code>` opens that person's keeps with a Follow button (here.now SPA mode serves index.html for unknown paths; assets use absolute paths). Profiles are unlisted: never shown in discovery, but anyone with the link can see and follow. Recipe shares carry `?by=<code>`. Handles only resolve for public/featured lists (Kelly), so first names can't be guessed.
