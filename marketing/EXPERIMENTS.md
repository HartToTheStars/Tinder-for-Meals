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

## E-001: Recipe-page deck vs plain recipe page (retro baseline)
- Status: planned
- Hypothesis: The "Not tonight? Swipe a few" deck on recipe pages turns search visitors into swipers, because swiping is faster than scrolling a list.
- Primary metric / guardrail: share of recipe-page views with at least one swipe; guardrail: outbound recipe clicks per view (click to=out) must not drop.
- Pages and method: A/B with key e001_deck on /s/ pages, variant b hides the deck. Start once /s/ pages get 400+ views a week.
- Baseline (14 days): collecting from Nov 19. Nov 23 note: raw /s/ views are mostly crawlers (996 devices vs about 10 from Google), so the baseline restarts once track.js filters bots (backlog item 0). Do not start on raw view counts.
- Minimum effect worth acting on: +5 points swipe rate, or any drop in recipe clicks over 10%.
- Started / readout date: not started.
