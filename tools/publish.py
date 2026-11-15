"""Publish forks to here.now.

  python3 tools/publish.py            -> STAGING (password-protected, shows a "Staging" badge)
  python3 tools/publish.py --prod     -> PRODUCTION (https://forkslist.com)
  python3 tools/rollback.py           -> put production back to its previous version

Uploads the app plus og/ images and s/ share pages. Files are sent with their sha256, so unchanged
ones are skipped by here.now. Auth: a here.now API key in the Authorization header (in this
environment the network proxy injects it; elsewhere set HERENOW_API_KEY).

here.now sometimes answers the finalize step with a 502 while it still goes live, so after a failed
finalize this waits and checks the Site's live version instead of reporting failure.
"""
import hashlib, json, mimetypes, os, sys, time, urllib.error, urllib.request

PROD_SLUG = "humble-aura-cbq3"        # https://forkslist.com
STAGING_SLUG = "bright-jasper-8752"  # https://bright-jasper-8752.here.now (password-protected)
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = ["index.html", "styles.css", "app.js", "icons.js", "privacy.html", "sources.html", "lab.html"]
KEY = os.environ.get("HERENOW_API_KEY", "proxy-injected")
HEADERS = {"content-type": "application/json", "X-HereNow-Client": "claude-code/direct-api", "Authorization": f"Bearer {KEY}"}
API = "https://here.now/api/v1/publish"


class HttpError(Exception):
    pass


def req(method, url, body=None, headers=HEADERS):
    r = urllib.request.Request(url, data=body, method=method, headers=headers)
    try:
        with urllib.request.urlopen(r) as resp:
            t = resp.read()
            return json.loads(t) if t else {}
    except urllib.error.HTTPError as e:
        raise HttpError(f"{method} {url.split('?')[0]} -> {e.code}: {e.read()[:300].decode(errors='replace')}")


def files():
    out = list(APP)
    for d in ("og", "s"):
        for base, _, names in os.walk(os.path.join(ROOT, d)):
            out += [os.path.relpath(os.path.join(base, n), ROOT) for n in names]
    return sorted(out)


def spec():
    out = []
    for p in files():
        data = open(os.path.join(ROOT, p), "rb").read()
        ctype = mimetypes.guess_type(p)[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype in ("application/javascript", "application/json"):
            ctype += "; charset=utf-8"
        out.append({"path": p, "size": len(data), "contentType": ctype, "hash": hashlib.sha256(data).hexdigest()})
    return out


def upload_and_finalize(slug, res, n_files):
    up = res["upload"]
    uploads = up.get("uploads", [])
    for i, u in enumerate(uploads, 1):
        req(u.get("method", "PUT"), u["url"], open(os.path.join(ROOT, u["path"]), "rb").read(), u.get("headers") or {})
        if i % 100 == 0:
            print(f"uploaded {i}/{len(uploads)}", flush=True)
    version = up["versionId"]
    try:
        fin = req("POST", up["finalizeUrl"], json.dumps({"versionId": version}).encode())
        ok = fin.get("success")
    except HttpError as e:
        print(f"finalize answered with an error ({e}); checking whether it went live anyway...", flush=True)
        ok = False
        for _ in range(12):
            time.sleep(10)
            try:
                if req("GET", f"{API}/{slug}").get("currentVersionId") == version:
                    ok = True
                    break
            except HttpError:
                pass
    print(json.dumps({"site": slug, "files": n_files, "uploaded": len(uploads), "skipped": len(up.get("skipped", [])), "live": bool(ok), "version": version}))
    return 0 if ok else 1


def publish(slug):
    s = spec()
    for attempt in range(6):
        try:
            res = req("PUT", f"{API}/{slug}", json.dumps({"files": s}).encode())
            break
        except HttpError as e:
            if "finalize_in_flight" not in str(e) or attempt == 5:
                raise SystemExit(str(e))
            time.sleep(10)
    return upload_and_finalize(slug, res, len(s))


def create_staging():
    s = spec()
    res = req("POST", API, json.dumps({"files": s, "spaMode": True, "displayName": "forks (staging)",
                                        "displayDescription": "Staging copy of forkslist.com for testing changes before they ship."}).encode())
    slug = res.get("slug") or res.get("site", {}).get("slug")
    print("created staging site:", slug, res.get("siteUrl") or "")
    upload_and_finalize(slug, res, len(s))
    return slug


if __name__ == "__main__":
    if "--create-staging" in sys.argv:
        create_staging()
        sys.exit(0)
    target = PROD_SLUG if "--prod" in sys.argv else STAGING_SLUG
    print(f"publishing to {'PRODUCTION (forkslist.com)' if target == PROD_SLUG else 'staging'}", flush=True)
    sys.exit(publish(target))
