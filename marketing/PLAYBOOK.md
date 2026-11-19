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
- Outreach emails are Gmail drafts with Andrew's signature, written in his voice. **Andrew** sends them.
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

## Backlog (top is next)

1. Seasonal collections: Thanksgiving leftovers, Christmas cookies, holiday appetizers, New Year's Eve
   snacks, cozy winter soups (build now for December).
2. Ingredient pages for the top 20 ingredients across the catalog ("recipes with chicken thighs").
3. "Start a round with these" link on every collection and recipe page, into Swipe Together.
4. Search Console review: list striking-distance queries in LOG.md, improve those pages.
5. Sunday email signup moments in the app (after a match, after 10 keeps).
6. /partners/ media kit page with live numbers (noindex until the outreach gate).
7. Directory submissions: Product Hunt prep (draft only, launch needs Andrew), AlternativeTo, SaaSHub,
   recipe-app roundups.
8. Monthly data post: most-kept dinners of the month.
9. Prospect list: 40 brands with a named contact path each.
