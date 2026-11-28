# forks growth playbook

Owner: Claude, running on scheduled tasks. Andrew is not required except where marked **Andrew**.

## Goal and stop condition

Sign one brand partnership worth at least $500/month. When `marketing/PIPELINE.md` has a deal with
status `signed` at $500/month or more, the program is done: the weekly report run deletes all three
scheduled tasks (`forks-growth-build`, `forks-growth-partners`, `forks-growth-report`) and tells Andrew.

## Starting point (Nov 19, 2026)

- 4 signed-up users, 222 swipes, 55 guest swipes, 11 Swipe Together rounds, 4 on the Sunday email.
- 997 recipes from Half Baked Harvest, Bon Appetit and Smitten Kitchen.
- About 860 pages in the sitemap. Google Search Console verified, sitemap read Nov 19. GA4 G-GY7HMLN3R5.

## What a brand pays for

Brands pay for attention from people who are deciding what to cook. forks has two things to sell:

1. **Sponsored deck.** A clearly labeled collection of the brand's recipes (or recipes that use its
   product) that people swipe like any other deck. Example: "Weeknight pasta, with Rao's." Lives on
   the site at /recipes/<brand-slug>/ and as an optional deck in the app.
2. **Sunday email feature.** One labeled recipe card from the brand in the Sunday pick email.

Neither looks like a banner. Both are recipe cards in the same style as everything else, with a small
"Presented by" line. Every sponsored placement goes through `marketing/APPROVALS.md` first.

Price anchors: food newsletters sell at roughly $25 to $50 per 1,000 sends; native recipe placements
on food sites at roughly $15 to $40 per 1,000 views. $500/month needs around 15,000 to 25,000 monthly
pageviews, or 2,000+ engaged email subscribers, or a small brand that values the audience fit over
reach. The realistic window is 4 to 9 months from now.

## Test and learn

Every change is an experiment. Nothing ships without a written hypothesis, and nothing is called a win
without numbers. Results, including losses, go in `marketing/EXPERIMENTS.md`.

### What gets measured

- `track.js` (on every page) sends anonymous events to Supabase `meals_events` and to GA4.
  Columns: `at, name, path, did (random device id), exp (active A/B buckets), ref (referring host), host (prod or staging), props`.
- Events: `view` (with utm), `click` (every link: `to` = app, out, or the first path segment; `el` = class or data-track),
  `swipe` (`liked`, `src` app or seo), `save_prompt`, `signup` (`status`, `src`), `open_app`, `round_start`,
  `round_vote`, `share` (`what`), `sunday` (`on`).
- Query with SQL on project dmwsylofgfocmbqvmgfe, always `where host = 'prod'` and excluding `did` values
  that look like tests. GA4 and Search Console add search queries, positions and acquisition.
- The core funnel, per page type (recipe `/s/`, collection `/recipes/`, guide pages, app `/`):
  view -> engaged (any swipe or click) -> app (click to=app or open_app) -> signup -> returning (2+ days active).
- North-star for partners: weekly engaged devices, and Sunday subscribers.

### How a test runs

1. Write the entry in EXPERIMENTS.md before building: id (E-001...), hypothesis ("If we X, then Y moves
   because Z"), the one primary metric, guardrail metric, baseline from the last 14 days, the minimum
   effect worth acting on, the method, and the readout date.
2. Method by traffic:
   - **A/B** when the pages involved get 400+ views a week: `forksExp("e001_name", ["a","b"])` in the
     page script, render the variant, events carry `exp`. Run at least 14 days and until each arm has
     ~200 exposures. Call it with a two-proportion z-test at 90% confidence; otherwise "no result".
   - **Before/after** below that: ship to a page group, compare 14 days before vs after against an
     untouched control group of similar pages (difference in differences). Treat as directional.
   - **SEO tests**: change a page group, compare Search Console clicks and impressions 28 days before
     vs after against a control group.
3. One live test per page type at a time, so results don't mix.
4. Readout in EXPERIMENTS.md: result, numbers, confidence, decision (ship, revert, iterate), and the
   lesson in one sentence. Losers get reverted. Lessons feed the backlog order.
5. Bigger bets first: with low traffic only large effects are detectable, so test bold changes
   (new CTA placement, new page type, new loop), not button colors.

## The four tracks

### 1. Search (the engine)

The site already has recipe pages, collections, /what-to-make-for-dinner/, /compare/,
/swipe-together/. Next:

- Long-tail collections people search for: "what to make with chicken thighs", "easy dinners for two",
  "cozy fall dinners", ingredient pages, season and holiday pages (Thanksgiving sides, Christmas
  cookies, Super Bowl snacks, Valentine's dinner for two). Build each 3 to 5 weeks before its season.
- Better recipe pages: richer descriptions, FAQ blocks, internal links, structured data checks.
- Use Search Console queries each week to find pages sitting at positions 8 to 30 and improve them.
- More recipe sources, if Andrew approves adding a source (a source is a publisher relationship).

### 2. Product loops (free distribution)

- Swipe Together is the best loop: every round sends a link to someone new. Make starting one easier
  from recipe pages, collections and the Sunday email, and make the match screen shareable.
- Share cards (og images) for recipes and decks, so links look good in texts and group chats.
- Grow the Sunday email list: it is the asset brands pay for. Offer it at the right moments (after a
  match, after 10 keeps), never as a popup.

### 3. Earned attention (no ads)

- Pitch drafts to food newsletters, roundups ("best recipe apps"), and app directories (Product Hunt,
  AlternativeTo, There's An AI For That style lists). Submissions to directories that take a form
  are fine without Andrew. Anything sent as an email from Andrew is a Gmail draft he sends.
- Write a monthly data post from forks' own swipe data ("the dinners people keep the most this
  month"). These earn links and give the newsletter something to say.

### 4. Partners

- Build the prospect list in `marketing/PIPELINE.md`: brands whose products show up in recipes people
  keep (pasta sauces, spices, olive oil, cookware, meal kits, grocery delivery, the recipe publishers
  themselves).
- Build a /partners/ page with live audience numbers and the two placements above.
- **Gate:** start outreach when the site has 5,000 monthly pageviews or 300 Sunday subscribers,
  whichever comes first. Before the gate, research only. Pitching with no audience burns the list.
- Outreach emails are Gmail drafts in the andrew@timeboss.us account, sent from andrew.r.hartman@gmail.com,
  with the "andrew.r.hartman@gmail.com - Forks" signature, written in his voice. **Andrew** sends them.
- Pricing, contracts and invoicing: **Andrew** decides and signs. Claude drafts the terms.

## Who decides what

| Claude does without asking | Andrew approves first |
| --- | --- |
| New and improved SEO pages, collections, structured data | Any ad, sponsored card or "Presented by" placement (via APPROVALS.md) |
| Product changes that help sharing or signups, through the design skills | Sending any email or message (drafts only) |
| Publishing those to production, then checking them live | Adding a new recipe source |
| Directory and app-list submissions through web forms | Public keeps pages, links in the Sunday email |
| Prospect research, pitch drafts, the media kit page | Prices, terms, contracts |
| Weekly report and this playbook | Creating social accounts or paid ad spend |

## Files

- `PLAYBOOK.md`: this file. The runs follow it and may edit the backlog below.
- `LOG.md`: one entry per run, newest first, with what shipped and the numbers.
- `PIPELINE.md`: brand prospects and deal status.
- `APPROVALS.md`: ads and sponsored placements waiting on Andrew, with his decision recorded.
- `EXPERIMENTS.md`: every test with hypothesis, metric, baseline, result and lesson.

## Backlog (top is next)

Each build item ships as an experiment (see Test and learn). Reorder by what past readouts taught.
Reordered Nov 27 after the second report: Search Console impressions grew about 6x (225 to 1,320 in
28 days), driven by Thanksgiving recipes and the Bon Appetit collection, then traffic fell to zero
after Nov 24. Seasonal pages and click-through on pages that already rank now matter most.

0. Measurement. (a) DONE Nov 23 (track.js v2, E-002). Exclude `props ? 'bot'` rows and device
   68f5a922-ad2a-4142-923d-47928709cb58 (the Nov 27 report check) in reports. (b) Partly done: `view`
   confirmed from a real Chrome session Nov 27; `click` and `swipe` have real prod rows. Still open:
   signup, round_start, round_vote, share, sunday. Needs a human session or the first real rows.
   First clean 14-day baseline ends Dec 7.
1. Christmas and winter seasonal collections, now: Christmas cookies, holiday appetizers, New Year's Eve
   snacks, cozy winter soups. Christmas is 4 weeks out, inside the 3 to 5 week window. Thanksgiving
   recipe pages ranked 6 to 10 within days of the sitemap read, so seasonal pages are the fastest
   proven source of clicks. Link them from / and the matching publisher collections.
2. Search Console striking distance, starting with click-through: /recipes/bon-appetit/ had 269
   impressions for "bonappetit recipes" at position 8.7 and no clicks. Rewrite its title and meta
   description to offer what bonappetit.com does not ("swipe 189 Bon Appetit dinners, keep the ones you
   want"), then the other collections Google shows at 8 to 25 (smitten-kitchen-appetizers,
   smitten-kitchen-drinks, half-baked-harvest-appetizers, half-baked-harvest-desserts, dairy-free):
   titles and H1s in the query wording, intro copy, more cards, FAQ, internal links. SEO test vs an
   untouched set of publisher collections (H-4).
3. Recipe-page snippets for the /s/ pages at positions 8 to 11 (broccoli slaw, pasta e ceci, maple bourbon
   chicken, bourbon caramel apple pie, honey mustard chicken, candied bacon pinwheels): titles in the
   "[publisher] [dish]" wording people search, since that is the pattern of every click so far.
4. More publisher-by-category collections (Smitten Kitchen soups, Half Baked Harvest pasta, Bon Appetit
   chicken, and so on) where the catalog has 12+ recipes (H-2).
5. Diet collections Google already associates with forks but where no page targets the query:
   dairy-free dinners, dairy-free appetizers, gluten-free vegetarian dinners (H-5).
6. Ingredient pages for the top 20 ingredients across the catalog ("recipes with chicken thighs").
7. Move the deck above "Get the recipe" on /s/ pages, or add a "swipe more like this" step before the
   click-out (H-1). 6 of 6 engaged search visitors this week clicked out and none swiped.
8. "Start a round with these" link on every collection and recipe page, into Swipe Together.
9. /compare/ variants for "[publisher] alternatives" and "apps like [publisher]" (H-3).
10. Sunday email signup moments in the app (after a match, after 10 keeps).
11. /partners/ media kit page with live numbers (noindex until the outreach gate).
12. Directory submissions: Product Hunt prep (draft only, launch needs Andrew), AlternativeTo, SaaSHub,
    recipe-app roundups and food blogs that take tips by form.
13. Monthly data post: most-kept dinners of the month.
14. Prospect list: 40 brands with a named contact path each (10 so far).

### Hypotheses from the data

- H-1 (Nov 23, held Nov 27): Search visitors to recipe pages click out to the publisher and do not swipe
  (2 of 2 engaged Google visitors on Nov 23, 6 of 6 on Nov 27). If the deck is shown above the "Get the
  recipe" button instead of below it, swipe rate on /s/ rises. Test as E-001's variant once human /s/
  traffic allows; before then, before/after with GA4 counts.
- H-2 (Nov 23): Most impressions are "[publisher] + [category]" queries. If we add publisher-by-category
  collections, impressions grow faster per page than for generic collections. SEO before/after vs
  generic collections built in the same weeks.
- H-3 (Nov 23): "bon appetit alternatives" already ranks at 6.7 with no page aimed at it. If /compare/
  gets per-publisher alternatives pages, they reach the top 5 for those queries.
- H-4 (Nov 27): Collections at position 8 to 10 get impressions but no clicks because the snippet reads
  like a copy of the publisher's own site. If titles and descriptions lead with what forks adds (swipe,
  keep, decide together), CTR on those collections rises from 0% to at least 2% at the same position.
  SEO before/after, 28 days, against untouched collections.
- H-5 (Nov 27): Google already shows forks at positions 53 to 98 for dairy-free dinner and gluten-free
  vegetarian queries from pages that do not target them. If we build collections aimed at those exact
  queries, they reach positions under 20 within 28 days.
- H-6 (Nov 27): Seasonal recipe searches drive most clicks and stop right after the holiday. If seasonal
  collections are published 3 to 5 weeks ahead and linked from the home page, Christmas week clicks
  exceed Thanksgiving week's 13.
