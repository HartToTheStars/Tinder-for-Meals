# Experiments

Newest first. Template:

```
## E-000: short name
- Status: planned | running | read out
- Hypothesis: If we ..., then ... moves, because ...
- Primary metric / guardrail:
- Pages and method: A/B (exp key) | before/after vs control | SEO before/after
- Baseline (14 days):
- Minimum effect worth acting on:
- Started / readout date:
- Result:
- Decision:
- Lesson:
```

## E-002: Filter bots and unseen pages out of `view`
- Status: planned
- Hypothesis: If track.js drops `view` (and every other event) for automated browsers and only sends `view` once the page has been visible for 1 second, then first-party view devices fall to roughly what GA4 reports, because about 99% of current `view` rows are crawlers that run JavaScript (one view, no referrer, no other event).
- Primary metric / guardrail: weekly distinct prod `view` devices divided by GA4 weekly users (target 0.5 to 3). Guardrail: views with a google.com referrer must not drop (8 devices in the baseline window), and app events (click, swipe) must keep arriving.
- Pages and method: every page (track.js v2). Before/after, 7 days each side, against GA4 users as the control, since GA4 already filters known bots and is not touched by this change.
- Baseline (14 days to Nov 23, host = prod; all rows are from Nov 19 on): 1,496 views from 1,491 devices; 1,481 devices had one view, no referrer and no other event; 8 devices had a referrer; 3 clicks from 3 devices; no other event names. GA4, 28 days: 65 views, 28 users (about 7 users a week). Ratio now: about 200x.
- Minimum effect worth acting on: ratio falls below 5x. If it stays above 5x, iterate (tighten the visible time or add a scroll/interaction requirement).
- Started / readout date: see below. Readout Dec 1, 2026 (7 days after). The 14-day baseline for E-001 and every later test starts the day this ships.
- Result:
- Decision:
- Lesson:

## E-001: Recipe-page deck vs plain recipe page (retro baseline)
- Status: planned
- Hypothesis: The "Not tonight? Swipe a few" deck on recipe pages turns search visitors into swipers, because swiping is faster than scrolling a list.
- Primary metric / guardrail: share of recipe-page views with at least one swipe; guardrail: outbound recipe clicks per view (click to=out) must not drop.
- Pages and method: A/B with key e001_deck on /s/ pages, variant b hides the deck. Start once /s/ pages get 400+ views a week.
- Baseline (14 days): collecting from Nov 19. Nov 23 note: raw /s/ views are mostly crawlers (996 devices vs about 10 from Google), so the baseline restarts once track.js filters bots (backlog item 0). Do not start on raw view counts.
- Minimum effect worth acting on: +5 points swipe rate, or any drop in recipe clicks over 10%.
- Started / readout date: not started.
