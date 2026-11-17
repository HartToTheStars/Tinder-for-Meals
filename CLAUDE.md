# forks (forkslist.com)

Recipe swiping app. Vanilla JS (app.js, styles.css, index.html, icons.js), Supabase backend
(project dmwsylofgfocmbqvmgfe: RPCs, edge functions under supabase/functions, records of migrations
under supabase/sql), hosted on here.now.

## Rules from Andrew

- **Every design request runs through the `frontend-design` skill first**, then the project's
  `frontend-ux` skill. This covers new screens, flows, buttons, sheets, copy placement, animations and comps.
  - `frontend-design` is Anthropic's skill at `/mnt/skills/public/frontend-design/SKILL.md`. It may not
    show in the session's skill list, so read the file directly before designing. It supplies the
    plan, review, build and critique process, plus restraint and UI copy.
  - `frontend-ux` (`.claude/skills/frontend-ux/SKILL.md`) adds forks' own rules: hierarchy, destructive
    actions, discoverability, tokens, and the light + dark screenshot review before shipping.
- **Deploys default to production** (`python3 tools/publish.py --prod`). Use staging
  (`python3 tools/publish.py`, https://bright-jasper-8752.here.now) only when Andrew asks for staging,
  or for a feature that already lives on staging only.
- Features still staging-only: Swipe with someone, "Show me anything" filters (replaced the Filters link). Never ship them to
  production without Andrew's go. A production hotfix must be built from what's live, without them.
- Bump the `?v=` cache-busting query on app.js / styles.css in index.html with every change.
- No em dashes in user-facing copy.
