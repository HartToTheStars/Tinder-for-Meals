---
name: frontend-ux
description: Required for every design or UI change to forks (forkslist.com): new screens, sheets, buttons, flows, copy placement, animations, comps, and any "make it look/feel better" request. Run it before writing UI code or a comp, and again as a review before shipping to staging.
---

# forks front-end UX

Andrew's rule for this project: every design request goes through this skill. It exists because UI that
technically works can still be bad (example: the "End round and start over" link in Swipe with someone
was a muted underlined text link that changed to red on first tap, sitting under the main swipe
controls, with an unclear consequence). Work through the four steps in order.

## 1. Frame it before drawing anything

Write these down (in your head or your reply) before any markup:

- **Who and when:** which person (host, guest, signed in, first visit) and the moment they hit this.
- **The one primary action** on the screen. Everything else is secondary or tertiary and must look it.
- **What could go wrong:** destructive or irreversible outcomes, who else it affects (other people in
  a round, email recipients), and how the person undoes it.
- **What state must be visible:** filters on, timer running, who is waiting, what was saved.

## 2. Rules for this app

Layout and hierarchy
- One primary button per screen (dark ink pill). Secondary = outlined pill or plain text. Never two
  equally loud buttons.
- Phone first at 390x844. Touch targets 44px minimum. Thumb zone: primary actions low, rare actions
  high or tucked away.
- Sheets close with an X in the top-right corner (`.sheet-x`), not a bottom Close/Done button. Their
  title must not collide with the X.
- Don't stack competing progress signals (count, bar, timer) in one strip. One clear header row.

Destructive and rare actions
- Never put a destructive or rare action (end, leave, delete, reset) inline with the primary flow or as
  a lone underlined link under the main controls.
- Put it behind an overflow menu (a "..." button in the header) that opens an action sheet. Each row says
  exactly what happens in plain words, and who it affects ("Ends the round for everyone").
- Confirm with a real dialog that states the consequence, has a clearly labelled destructive button
  (tomato) and a Cancel. Tap-twice-to-arm text is for low-stakes, solo actions only (and even then a
  dialog is usually clearer).
- Prefer undo over confirm where the action can be undone.

Discoverability and teaching
- Hidden controls get missed (NN/g: hiding nav roughly halves discoverability). If you tuck things away,
  keep the most-used 2-3 visible (Baymard: promoted filters) and label the trigger with text, not just
  an icon.
- Always show applied state (what filters are on, who's still swiping, what was saved).
- Teach in context at the moment it's useful (a tip after 4 dessert nopes), not with one-time intros or
  tutorials, which people forget (NN/g). One point per tip. Never cover the thing the tip is about.

Visual language (match what's there; tokens live in styles.css :root)
- Colors: --bg #f7f1e8, --paper #fffdf9, --ink #2a211c, --muted, --line, --tomato #e8553e (accent,
  destructive, active filter), --basil #3f9b6b (keep, success). Dark mode redefines them; every new
  surface must use the tokens so dark mode works.
- Type: Fraunces (serif) for headlines and the logo, Inter for UI. Headlines get the tomato period.
- Reuse existing components instead of look-alikes: main deck cards (`cardHTML`, stamps, `stampSlam`,
  `teach`), `.act` buttons, `.share-link` rows, `.break` sheets, toasts, `avatar()`.
- Motion: purposeful and short (150-450ms), respects prefers-reduced-motion, celebrations restrained
  (confetti was toned down once already).
- Icons: the lucide set in icons.js. No emoji in UI.

Copy
- Short, warm, specific. Say what happens ("Ends the round for everyone"), not what the system does.
- No em dashes. Names with possessives: "Kelly's", "James'".
- Keep the copy doc for a feature in sync when copy changes.

## 3. Build or comp

- New screen or a real layout change: comp it first on a Design canvas (Artifact, Design type), several
  frames side by side including the current state, and get Andrew's pick before building.
- Small changes: build directly on staging, still following section 2.

## 4. Review before shipping (always)

- Screenshot at 390x844 in BOTH light and dark mode with Playwright (scratchpad test harness pattern:
  serve files via page.route, local supabase-js bundle, mocked RPCs), and actually look at them.
- Run the critique as a demanding product designer: Is the primary action obvious in 1 second? Is
  anything destructive easy to hit by accident or hard to find when needed? Is any state invisible?
  Does anything overlap, wrap badly, or fall off the edge (long names, long links)? Would Apple's or
  Airbnb's design team ship this as is?
- Fix what the critique finds, then ship to staging (or production when Andrew says so).
