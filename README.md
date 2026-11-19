# forks.

Tinder for meals. Swipe right to keep a recipe, left to pass. Kept recipes live in a searchable list.

- **Frontend:** static `index.html` + `styles.css` + `app.js` (no build step).
- **Data:** Supabase project `side-quests`, tables `meals_recipes` and `meals_swipes`, RPC `meals_deck`.
- **Recipes:** `supabase/functions/meals-harvest` pulls from Smitten Kitchen, Half Baked Harvest and Bon Appétit (RSS + sitemaps). The Kitchn was dropped: its RSS is mostly shopping/news and its sitemaps refuse our fetches. Food52 blocks server-side fetches, so it's skipped. Runs weekly (Mondays 09:17 UTC) via pg_cron, with `meals-enrich` every 15 min for the 4 hours after; see `supabase/sql/2026-11-15_weekly_harvest.sql`. Share images (`tools/og/render.js`) are still a manual step.

Keys: ← pass, → keep, ↑ open recipe, Backspace undo, `/` search.

## Taste model
Every 10 swipes the app calls `meals_refine()`, which recomputes `meals_taste`: a shrunk log-odds weight per title word and per source, built from all keeps vs. passes. `meals_deck()` ranks unseen recipes by summed token weight plus random jitter, so favorites rise and there's still room to discover. The source token only counts for 35%, and each extra card from the same site in a batch ranks a little lower, so one favorite site can't take over the deck.

## Courses
`meals_recipes.category` is a generated column from `meals_category()` (keyword rules on the title): `main`, `appetizer`, `dessert`, `drink`. The swipe view filters with `meals_deck(n, sources, cat)`; the choice is remembered per device.

## Diet & lifestyle filters
`meals-enrich` reads each recipe page's ingredient list and cook time (schema.org JSON-LD, or microdata on Smitten Kitchen). `meals_tags()` turns that into a generated `tags` column: `kid`, `quick` (≤30 min), `protein`, `vegetarian`, `vegan`, `gluten-free`, `dairy-free`. Diet tags are only assigned from real ingredient lists or the site's own labels. Half Baked Harvest blocks page fetches, so it only gets title-based tags (kid, protein). These are best guesses; don't rely on them for allergies or celiac.

## Accounts
- Guests swipe without signing in; their swipes live in `localStorage` (`forks:guest`) and are passed to `meals_deck` / `meals_taste_top` as `p_liked` / `p_noped`.
- On the 3rd swipe (with at least one keep) guests are offered "Don't lose your keeps". "No thanks, just browsing" stops the prompt for good on that device.
- `meals-auth` sends magic links via Resend (secret `RESEND_API_KEY`, sender hello@forkslist.com). New email: account is created and guest swipes are saved immediately. Existing email: a sign-in link is sent; guest swipes merge after the link is opened.
- Links land on `/?login=<token_hash>`; the app calls `verifyOtp` and merges any guest swipes.
- Swipes are per user in `meals_user_swipes` (RLS: own rows only). The old shared `meals_swipes` table is kept as a closed backup; its rows were copied to Kelly.

## Share previews
`tools/og/render.js` renders 1200x630 preview images (og/<id>.jpg, og/site.jpg) with headless Chromium. Re-run it after a harvest to cover new recipes.

## Search pages (SEO)
`node tools/seo/build.js` (no browser needed) writes the crawlable site from the recipe table, then publish:
- `s/<id>/`: a real page per recipe (photo, source credit, tags, "Get the recipe" out to the publisher, "Swipe more like this" into the app, related recipes). These are also the share links. Recipes that drop off the list keep a noindex redirect so old shares still work.
- `recipes/` and `recipes/<slug>/`: collections by course, diet/time, source and useful combinations (at least 6 recipes each).
- `swipe-together/`: explains Swipe with someone, with an FAQ (FAQPage structured data).
- `sitemap.xml` and `og/index.json`.
App deep links used by these pages: `/?cat=main&want=vegetarian,quick` opens the deck pre-filtered, `/?start=together` opens Swipe with someone. `robots.txt` and `llms.txt` are hand-written.

## Profile links
Every profile has a random `share_code` (3 letters + 4 digits). `forkslist.com/<code>` opens that person's keeps with a Follow button (here.now SPA mode serves index.html for unknown paths; assets use absolute paths). Profiles are unlisted: never shown in discovery, but anyone with the link can see and follow. Recipe shares carry `?by=<code>`. Handles only resolve for public/featured lists (Kelly), so first names can't be guessed.


## Releasing

Changes go to staging first, then production.

1. `python3 tools/publish.py` publishes to **staging**, https://bright-jasper-8752.here.now (anyone with the link can open it; it shows a blue "Staging" badge and asks search engines not to index it). Try it on a phone.
2. `python3 tools/publish.py --prod` publishes to **production** (forkslist.com). Nothing reaches real users without `--prod`.
3. Something wrong in production? `python3 tools/rollback.py --previous` puts the previous version back instantly. `python3 tools/rollback.py` lists recent versions.

Staging and production share one Supabase database (same recipes, accounts, keeps). So:
- Swiping on staging changes your real keeps. Use a test account for messy testing.
- Database changes ship the moment they're applied, for both sites. Keep them additive: add a new function or column (`meals_people_v2` style) instead of changing one the live app calls, ship the front end that uses it, then clean up the old one. That way rollback.py is always safe.
- For risky schema work, use a Supabase branch (a throwaway copy of the database) rather than the live one.
