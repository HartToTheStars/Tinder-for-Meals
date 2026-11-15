"""Put production (forkslist.com) back to an earlier version, instantly (no re-upload).

  python3 tools/rollback.py              -> list recent production versions
  python3 tools/rollback.py --previous   -> restore the version before the live one
  python3 tools/rollback.py <versionId>  -> restore that version
  add --staging to act on the staging site instead

Only the website files roll back. Database changes (Supabase functions, tables) are separate:
keep them additive so an older front end still works against them.
"""
import json, sys
from publish import API, PROD_SLUG, STAGING_SLUG, HttpError, req

slug = STAGING_SLUG if "--staging" in sys.argv else PROD_SLUG
args = [a for a in sys.argv[1:] if not a.startswith("--")]

site = req("GET", f"{API}/{slug}")
live = site.get("currentVersionId")
data = req("GET", f"{API}/{slug}/versions")
versions = data.get("versions", data if isinstance(data, list) else [])

if not args and "--previous" not in sys.argv:
    for v in versions[:10]:
        vid = v.get("id") or v.get("versionId")
        print(("LIVE  " if vid == live else "      ") + f"{vid}  {v.get('createdAt', '')}  {v.get('source', '')}")
    sys.exit(0)

if "--previous" in sys.argv:
    ids = [v.get("id") or v.get("versionId") for v in versions]
    if live not in ids or ids.index(live) + 1 >= len(ids):
        raise SystemExit("couldn't find a version before the live one; run without arguments to list them")
    target = ids[ids.index(live) + 1]
else:
    target = args[0]

try:
    print(json.dumps(req("POST", f"{API}/{slug}/versions/{target}/restore")))
    print(f"restored {target} on {'staging' if slug == STAGING_SLUG else 'production'}")
except HttpError as e:
    raise SystemExit(str(e))
