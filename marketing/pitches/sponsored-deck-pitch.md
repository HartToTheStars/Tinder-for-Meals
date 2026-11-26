# Pitch template: sponsored deck (pre-gate draft)

Written Nov 26, 2026 by the partners run. The outreach gate (5,000 monthly pageviews or 300 Sunday
subscribers) is not met, so this is a template only. Nothing goes to Gmail until the gate is met.
Written in Andrew's voice (my-writing-style profile). Before it is used, refresh every number in
"Numbers to refresh" from the latest weekly report.

## Numbers to refresh (as of Nov 26, 2026)

| Number | Value now | Source |
| --- | --- | --- |
| Recipes in the catalog | 1,242 (Half Baked Harvest, Bon Appetit, Smitten Kitchen) | meals_recipes, is_recipe and not roundup |
| Recipes that call for the brand's product | Diamond Crystal: 153 by name. Olive oil: 293. Butter: 480. Flour: 300. Vanilla: 169. Chocolate: 153. | meals_recipes ingredients text match |
| Monthly pageviews | about 70 (GA4, 28 days to Nov 23) | GA4 |
| Google impressions | 225 a month, average position 15 | Search Console |
| Sunday email subscribers | 4 | meals_email_prefs |
| Swipe Together rounds and votes | 11 rounds, 93 votes | meals_together, meals_together_votes |

At the gate, the pitch should lead with the strongest of: monthly pageviews, Sunday subscribers, or
weekly engaged devices. Today none of these would persuade a brand, which is why the gate exists.

## Subject line options (test two when there are 10+ pitches)

- A: `[N] forks recipes already call for [Product]`
- B: `A swipeable [Product] deck for home cooks`

Variant A leads with fit (their product is already in the recipes). Variant B leads with the format.
Log sends and replies per variant in EXPERIMENTS.md.

## Body (Gmail native spacing when drafted: one `<div>` per line, `<div><br></div>` for blank lines)

```
Hi [First name],

Hope your week is going well! I'm a big fan of [one specific, true thing about the brand, e.g. "the Drizzle and Sizzle squeeze bottles. They live next to my stove."].

I run forks (forkslist.com). People swipe through dinner ideas from Smitten Kitchen, Bon Appetit and Half Baked Harvest, keep the ones they want, and pick dinner together with Swipe Together.

[N] of our [catalog size] recipes already call for [Product] by name, like [Recipe 1] and [Recipe 2].

I'd love to build a [Brand] deck: a labeled set of recipes that use [Product], swiped like any other deck, plus one feature in our Sunday dinner email. [Audience line: monthly visitors, Sunday subscribers, or weekly swipers.]

Happy to send a mockup so you can see how it looks first. Would that be helpful?

Thanks!
Andrew
```

About 110 words. Keep it under 130.

## Worked example: Diamond Crystal

- Subject (A): `153 forks recipes already call for Diamond Crystal`
- Specific opener: Bon Appetit's test kitchen writes "Diamond Crystal" into its recipes by name, and
  forks carries 153 of them (Bon Appetit's Moussaka, Lemon Bars and Bechamel among them).
- Deck idea: "Salt it right, with Diamond Crystal": the 153 recipes, ordered by keep rate.

## Rules for whoever sends this

- Andrew sends. Claude only drafts in Gmail once the gate is met.
- No price in the first email. Price anchors live in PLAYBOOK.md and are Andrew's call.
- Every link in the email carries utm_source=[brand-slug], utm_medium=email, utm_campaign=partner_pitch.
- The mockup (recipe-card comp) goes through APPROVALS.md before it is shown to any brand.
