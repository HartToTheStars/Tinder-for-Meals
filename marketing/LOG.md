# Growth log

Newest first. One entry per run.

## Nov 27, 2026: weekly report

Window: this week = Nov 20 to Nov 27 (rolling 7 days, prod, test devices and `props.bot` rows excluded). Last week = Nov 13 to Nov 20. The bot filter shipped Nov 23 at about 18:00 UTC, so raw `view` counts before then are still mostly crawlers. Engagement events (swipe, click) were never bot traffic and compare cleanly.

### Funnel, prod, distinct devices

| Page type | Views (raw) | Views after the filter (Nov 23 to 27) | From google.com | Engaged | To app | Signups | Rounds | Votes | Shares | Sunday | Outbound | WoW engaged |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| /s/ recipe | 333 (last week 677) | 6 | 12 | 6 | 0 | 0 | 0 | 0 | 0 | 0 | 6 | 0 to 6 |
| /recipes/ collection | 10 (104) | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 to 0 |
| Guide pages | 8 (4) | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 to 0 |
| / app | 246 (122) | 4 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 to 1 |

- Returning devices (2+ days): 0 this week, 0 last week.
- All 6 engaged recipe-page devices clicked out to the publisher (Bon Appetit, Smitten Kitchen). None swiped. The one app swipe session was 5 swipes, all left, on Nov 24.
- Referrers: www.google.com (12 devices). No other referrer, no utm sources.
- No events at all since Nov 24 21:12 UTC. I checked this is real and not broken tracking: the site and track.js?v=2 serve normally, nothing was deployed since Nov 23, Supabase API logs for the last 24 hours show only Googlebot and Reflectionbot calling the meals RPCs, GA4 also shows 0 users for Nov 25 to 27, and a recipe page loaded in Chrome sent its `view` insert (201) and its GA4 hits. Note: that check created one prod `view` row from device 68f5a922-ad2a-4142-923d-47928709cb58 on Nov 27. Exclude it.

### Database (meals only)

| Metric | This week | Last week | Total |
| --- | --- | --- | --- |
| New users (auth.users) | 0 | 4 | 4 |
| meals_user_swipes | 0 | 222 | 222 |
| meals_together rounds | 0 | 11 | 11 |
| Sunday pick on | | | 4 (unchanged) |

No signed-in app activity since Nov 19.

### GA4 (property forks)

- Last 7 days: about 29 active users (last week about 8), 29 sessions: 14 direct, 13 organic search, 1 referral (dataindex.pro, likely spam), 1 unassigned.
- Last 28 days: 74 views, 36 users. Top pages: / (35 views, 22 users), one /s/ recipe (10), Almost-Classic Sweet Potato Casserole (6), /swipe-together/ (4), /recipes/ and /recipes/high-protein/ (2 each).
- Nov 25 to 27: 0 users.

### Search Console (https://forkslist.com/, 28 days, data through Nov 25)

13 clicks (last report 4), 1,320 impressions (last report 225), 1.0% CTR, average position 13.5. 159 queries, 235 pages with impressions. Daily impressions: Nov 21 180, Nov 22 312, Nov 23 392, Nov 24 385, Nov 25 6 (the last day is usually partial, but this drop matches the zero traffic since Nov 24; check again next week).

Clicks came from recipe pages that rank 5 to 12 for "[publisher] + dish" queries: Almost-Classic Sweet Potato Casserole (5 clicks, 68 impressions, position 6.3) and seven other /s/ pages with 1 or 2 clicks each. Thanksgiving dishes drove most of it.

Striking-distance queries (position 8 to 30) and the page to improve:

| Query | Impr. | Pos. | Page |
| --- | --- | --- | --- |
| bonappetit recipes | 269 | 8.7 | /recipes/bon-appetit/ (276 impr., pos. 8.9, 0 clicks; was 23.8 last week) |
| smitten kitchen appetizers | 14 | 9.1 | /recipes/smitten-kitchen-appetizers/ |
| smitten kitchen sidecar | 9 | 9.3 | /recipes/smitten-kitchen-drinks/ (and "smitten kitchen cocktails", 6 at 6.0) |
| smitten kitchen broccoli slaw; smitten kitchen pasta e ceci | 9; 8 | 9.8; 8.5 | their /s/ pages |
| maple bourbon chicken with brussels sprouts | 8 | 9.8 | its /s/ page |
| bourbon caramel apple pie bon appetit (2 variants) | 10 | 9.3 to 10.0 | its /s/ page |
| half baked harvest apps; hbh appetizers; half baked harvest appetizers | 5; 4; 5 | 8.6; 9.0; 14.4 | /recipes/half-baked-harvest-appetizers/ |
| honey mustard chicken half baked harvest | 5 | 10.6 | its /s/ page |
| candied bacon pinwheels | 5 | 10.8 | its /s/ page |
| half baked harvest desserts; best half baked harvest desserts | 4; 2 | 17.2; 25.0 | /recipes/half-baked-harvest-desserts/ |
| dairy free recipes for short people, military | 7 | 9 to 10.5 | /recipes/dairy-free/ |

Demand we do not target yet: "dairy free appetizers" (14 impr., position 73), "dairy free dinner recipes" and 10 similar dairy-free dinner queries (positions 67 to 98), and about 12 "gluten free vegetarian meals" variants (positions 53 to 96).

### Experiments

No readouts due. E-002 (bot filter) reads out Dec 1. Early look, not a readout: first-party prod `view` devices fell from about 1,490 in the 14 days before to 11 in the 4 days after the filter, while GA4 kept counting humans, so the ratio is heading toward the target. The Nov 25 to 27 traffic gap will make the 7-day post window thin. E-001 stays planned (human /s/ views are about 10 a week, far under 400).

Smoke test (backlog 0b): `view` now confirmed from a real Chrome session, `click` (to=out) and `swipe` (src app) have real prod rows. Still unverified: signup, round_start, round_vote, share, sunday.

### Lessons

- Search impressions grew about 6x in a week. Thanksgiving recipes and the Bon Appetit collection did it; the site is now indexed well enough that seasonal pages can pay off.
- Recipe pages win clicks at position 6 to 10. The Bon Appetit collection got 269 impressions at 8.7 and no clicks, so its title and snippet do not win the click against bonappetit.com itself.
- Search visitors still click out and do not swipe (6 of 6 engaged recipe-page devices). H-1 holds.
- Traffic stopped completely after Nov 24. The cause is not confirmed; the likeliest one is that Thanksgiving recipe searches ended. Next week's Search Console data will show whether impressions recovered.

### Outreach gate

Not met. GA4: 74 pageviews in 28 days against 5,000 a month. Sunday subscribers: 4 against 300.

### Needs Andrew

- APPROVALS.md: nothing open.
- Gmail pitch drafts: none (pre-gate).
- Deal decisions: none.
- Still optional from Nov 26: submit forks to Launching Next by hand; decide on Fazier and King Arthur's Awin affiliate program.
- Nothing new since last week.

## Nov 26, 2026: partners and distribution run

- Prospects: added 10 brands to PIPELINE.md, each with the catalog recipes that use the product and a contact path: Diamond Crystal (153 recipes name it), Graza, Brightland, King Arthur Baking, Burlap & Barrel, Rancho Gordo, Guittard, Nielsen-Massey, Fly By Jing, Made In. Verified role addresses on the brand's own site for Burlap & Barrel, Rancho Gordo, Guittard and King Arthur (affiliates). Named leads come from third-party pages and are marked unverified. Skipped Kerrygold: no contact path found.
- Placement attribution: no utm-tagged placements exist yet. Clean prod traffic since the Nov 23 bot filter: 11 views from 10 devices, 5 swipes from 1 device, 4 clicks from 3 devices. The only referrer in 14 days is google.com (21 events, 12 devices).
- Distribution: no submissions this week. Checked three free directories and none could be done within the rules:
  - Launching Next (launchingnext.com/submit): free form, no account, but it has a "What is 2+3?" bot check, which I do not complete. Andrew can submit it in about 3 minutes. Tagged URL: https://forkslist.com/?utm_source=launchingnext&utm_medium=directory&utm_campaign=dir_launch_nov26
  - Fazier (fazier.com/submit): free tier needs an account and a backlink to Fazier on our homepage. Tagged URL if Andrew wants it: https://forkslist.com/?utm_source=fazier&utm_medium=directory&utm_campaign=dir_launch_nov26
  - Startup Stash: paid listings only. Skip.
  - Suggested copy for both: name "forks"; headline "Swipe to pick dinner, alone or together"; tags: recipes, cooking, meal planning, dinner ideas, food, couples. Description: "forks is a free recipe swiping app. Swipe through 1,200+ dinner ideas from Smitten Kitchen, Bon Appetit and Half Baked Harvest, keep the ones you want, and use Swipe Together to pick dinner with someone else. No account needed to start."
  - Lesson: general startup directories mostly gate on accounts, payments or bot checks. Next week, look at recipe-app roundups and food blogs that take tips by form instead.
- Outreach: gate not met (about 70 pageviews a month against 5,000; 4 Sunday subscribers against 300). No Gmail drafts. Wrote marketing/pitches/sponsored-deck-pitch.md: a pitch template in Andrew's voice with two subject-line variants, the current audience numbers to refresh, and a worked Diamond Crystal example.
- Comps: none. No prospect is at `talking`.

### Needs Andrew

- Optional: submit forks to Launching Next by hand (bot check) with the tagged URL and copy above.
- Optional: decide whether to join Fazier (account plus a homepage backlink) and King Arthur's Awin affiliate program (account and terms).
- APPROVALS.md: nothing open. Gmail drafts: none.

## Nov 23, 2026: build run, bot filter in track.js (E-002)

- Shipped track.js v2 to production (backlog item 0a). Automated browsers (webdriver, crawler and headless user agents) send nothing to `meals_events`; weaker signals (no languages, zero screen or window size) are sent with `props.bot = 1`. `view` now fires only after 1 second of continuous visibility, so prerendered and background tabs are not counted. GA4 calls are unchanged.
- Experiment: E-002, before/after against GA4 users. Baseline: 1,496 prod views from 1,491 devices in 14 days, 1,481 of them one view with no referrer and no other event; GA4 about 7 users a week. Readout Dec 1.
- Bumped `track.js?v=1` to `v=2` on all 886 pages and in tools/seo/build.js. I did not commit a full `node tools/seo/build.js` rebuild: it pulled about 190 new recipe pages and reshuffled collection cards from the live catalog, which would mix catalog changes into this measurement test. The next SEO build run will pick those up.
- Verified with a Node harness that runs track.js against simulated browsers (human, webdriver, Googlebot, HeadlessChrome, DuckDuckGo browser, no languages, hidden tab, tab left under 1 second, tab shown twice): each case sends or drops as intended. The built-in browser check was not possible because starting the local preview server was declined in this unattended run.
- Live: https://forkslist.com/ , https://forkslist.com/recipes/ , https://forkslist.com/compare/ and a sample /s/ page all serve track.js?v=2, and https://forkslist.com/track.js?v=2 has the new code. No prod rows arrived in the 30 minutes after publishing (expected with near-zero human traffic); the insert code path is unchanged.
- Left: item 0b, a real-browser smoke test of app events (swipe, round_start, round_vote, share, sunday, signup). Automated browsers are now dropped by design, so this needs a human session or a look at the first real rows. Reports should exclude rows where `props ? 'bot'`. Clean 14-day baseline for E-001 and later tests ends Dec 7.

## Nov 23, 2026: weekly report (first week of tracking)

Window: this week = Nov 16 to Nov 23 (rolling 7 days). Last week had no event tracking (track.js went live Nov 19), so funnel week-over-week is n/a. Database counts compare to the 7 days before.

### Data quality first

Supabase `meals_events` logged 1,475 views from 1,470 devices this week, almost all with one view, no referrer and no other event, peaking at 900 on Nov 20 (the day after the sitemap was read). GA4 (property forks, which filters known bots) shows 65 pageviews and 28 users for the last 28 days. Most `view` rows are crawlers that run JavaScript. Raw view counts are not usable until track.js filters them (backlog item 0).

### Funnel, prod, distinct devices

| Page type | Views (raw) | Views from google.com | Engaged | To app | Signups | Rounds started | Votes | Shares | Sunday opt-ins | Outbound clicks | WoW |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| /s/ recipe | 996 | 7 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 2 | n/a |
| /recipes/ collection | 111 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | n/a |
| Guide pages | 12 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | n/a |
| / app | 351 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | n/a |

- Returning devices (active on 2+ days): 1 (a google.com visitor who viewed the same recipe twice).
- Both engaged devices came from Google and clicked through to the publisher (Bon Appetit, Smitten Kitchen). Neither swiped.
- Referrers: google.com 8 views (7 devices); everything else had no referrer. No utm sources.
- GA4, 28 days: 65 views, 28 users. Top pages: / (33 views, 20 users), one recipe page (10), /swipe-together/ (4), /recipes/ (2), /recipes/high-protein/ (2).

### Database (meals only)

| Metric | This week | Previous 7 days | Total |
| --- | --- | --- | --- |
| New users (auth.users) | 0 | 4 | 4 |
| meals_user_swipes | 35 (1 user, all Nov 19) | 187 | 222 |
| meals_together rounds | 5 (all Nov 19) | 6 | 11 |
| Sunday pick on | | | 4 (unchanged since Nov 15) |

The last app swipe and the last round were both on Nov 19, before tracking went live. There has been no signed-in app activity since. The app swipe, round and Sunday events in track.js have never fired on prod, so they are unverified.

### Search Console (https://forkslist.com/, 28 days; data through Nov 21)

4 clicks, 225 impressions, 1.8% CTR, average position 15.1. 52 queries. The domain property sc-domain:forkslist.com is not visible to the signed-in account; the URL-prefix property works.

Striking-distance queries (position 8 to 30) and the page to improve:

| Query | Impr. | Pos. | Page |
| --- | --- | --- | --- |
| smitten kitchen appetizers | 6 | 10.0 | /recipes/smitten-kitchen-appetizers/ (8 impr., pos. 9.1) |
| smitten kitchen sidecar; smitten kitchen cocktails | 6; 3 | 9.0; 7.7 | /recipes/smitten-kitchen-drinks/ (7 impr., pos. 8.3) |
| half baked harvest apps; half baked harvest appetizers | 2; 1 | 9.0; 22.0 | /recipes/half-baked-harvest-appetizers/ (7 impr., pos. 10.3) |
| best half baked harvest desserts | 2 | 25.0 | /recipes/half-baked-harvest-desserts/ (7 impr., pos. 24.3) |
| bonappetit recipes | 4 | 23.8 | /recipes/bon-appetit/ (5 impr., pos. 20.8) |
| dairy free recipes for ... (military, short people, kid friendly) | 6 | 9 to 15 | /recipes/dairy-free/ (6 impr., pos. 22.7) |
| almost classic sweet potato casserole | 5 | 9.2 | its /s/ page (1 click) |
| maple bourbon chicken with brussels sprouts | 3 | 10.7 | its /s/ page |
| 30 minute vegetarian dinners | 1 | 10.0 | /recipes/30-minute-vegetarian-dinners/ |
| candied bacon pinwheels | 1 | 13.0 | its /s/ page |

Also: "bon appetit alternatives" at position 6.7 (3 impressions). The /compare/ page could target "[publisher] alternatives" and "apps like" queries.

### Experiments

No readouts due. E-001 (recipe-page deck A/B) stays planned: raw /s/ views look like 996 a week, but human views are closer to 10, far below the 400 a week start rule.

### Lessons

- First-party view counts are mostly bots. Gate decisions and A/B exposures must use GA4 or filtered events, never raw `view` rows.
- Almost all search demand is "[publisher] + [category or dish]". Publisher-by-category collections are the pages Google ranks first.
- Search visitors who engage click out to the publisher; none swiped. The deck on recipe pages has not yet shown it can turn a searcher into a swiper.

### Outreach gate

Not met. About 70 pageviews a month (GA4) against 5,000; 4 Sunday subscribers against 300.

### Needs Andrew

- APPROVALS.md: nothing open.
- Gmail pitch drafts: none (pipeline is empty; pre-gate research only).
- Deal decisions: none.
- Nothing new since last week.

## Nov 19, 2026: measurement live

- Added track.js: anonymous first-party events to Supabase meals_events and GA4 on every page (views, clicks, swipes, save prompts, signups, rounds, shares, Sunday opt-ins), with sticky A/B buckets via forksExp. Privacy page updated.
- Test-and-learn rules added to PLAYBOOK.md; EXPERIMENTS.md started. Baseline window runs to Dec 3.

## Nov 19, 2026: program set up

- Baseline: 4 users, 222 swipes, 55 guest swipes, 11 Swipe Together rounds, 4 Sunday subscribers,
  997 recipes, about 860 pages in the sitemap.
- Scheduled: build (Mondays 9:00), partners and distribution (Thursdays 9:00), report (Fridays 16:00).
