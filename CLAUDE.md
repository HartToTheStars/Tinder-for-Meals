# forks (forkslist.com)

Recipe swiping app. Vanilla JS (app.js, styles.css, index.html, icons.js), Supabase backend
(project dmwsylofgfocmbqvmgfe: RPCs, edge functions under supabase/functions, records of migrations
under supabase/sql), hosted on here.now.

## Rules from Andrew

- **Every design request runs through the `frontend-ux` skill** (.claude/skills/frontend-ux/SKILL.md):
  new screens, flows, buttons, sheets, copy placement, animations and comps. Frame it, follow the rules,
  and do the light + dark screenshot review before shipping.
- **Deploys default to production** (`python3 tools/publish.py --prod`). Use staging
  (`python3 tools/publish.py`, https://bright-jasper-8752.here.now) only when Andrew asks for staging,
  or for a feature that already lives on staging only.
- Features still staging-only: Swipe with someone, Filters behind one link. Never ship them to
  production without Andrew's go. A production hotfix must be built from what's live, without them.
- Bump the `?v=` cache-busting query on app.js / styles.css in index.html with every change.
- No em dashes in user-facing copy.
