"""Publish forks to here.now (https://forkslist.com).

Uploads the app plus og/ images and s/ share pages. Files are sent with their sha256, so unchanged
ones are skipped by here.now. Auth: a here.now API key in the Authorization header (in this
environment the network proxy injects it; elsewhere set HERENOW_API_KEY).
"""
import hashlib, json, mimetypes, os, sys, urllib.error, urllib.request

SLUG = "humble-aura-cbq3"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = ["index.html", "styles.css", "app.js", "icons.js", "privacy.html", "sources.html", "lab.html"]
KEY = os.environ.get("HERENOW_API_KEY", "proxy-injected")
HEADERS = {"content-type": "application/json", "X-HereNow-Client": "claude-code/direct-api", "Authorization": f"Bearer {KEY}"}


def req(method, url, body=None, headers=HEADERS):
    r = urllib.request.Request(url, data=body, method=method, headers=headers)
    try:
        with urllib.request.urlopen(r) as resp:
            t = resp.read()
            return json.loads(t) if t else {}
    except urllib.error.HTTPError as e:
        raise SystemExit(f"{method} {url.split('?')[0]} -> {e.code}: {e.read()[:400].decode(errors='replace')}")


def files():
    out = list(APP)
    for d in ("og", "s"):
        for base, _, names in os.walk(os.path.join(ROOT, d)):
            out += [os.path.relpath(os.path.join(base, n), ROOT) for n in names]
    return sorted(out)


def main():
    paths = files()
    spec = []
    for p in paths:
        data = open(os.path.join(ROOT, p), "rb").read()
        ctype = mimetypes.guess_type(p)[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype in ("application/javascript", "application/json"):
            ctype += "; charset=utf-8"
        spec.append({"path": p, "size": len(data), "contentType": ctype, "hash": hashlib.sha256(data).hexdigest()})
    res = req("PUT", f"https://here.now/api/v1/publish/{SLUG}", json.dumps({"files": spec}).encode())
    up = res["upload"]
    uploads = up.get("uploads", [])
    for i, u in enumerate(uploads, 1):
        req(u.get("method", "PUT"), u["url"], open(os.path.join(ROOT, u["path"]), "rb").read(), u.get("headers") or {})
        if i % 100 == 0:
            print(f"uploaded {i}/{len(uploads)}", flush=True)
    fin = req("POST", up["finalizeUrl"], json.dumps({"versionId": up["versionId"]}).encode())
    print(json.dumps({"files": len(spec), "uploaded": len(uploads), "skipped": len(up.get("skipped", [])),
                      "success": fin.get("success"), "warnings": fin.get("warnings")}))


if __name__ == "__main__":
    sys.exit(main())
