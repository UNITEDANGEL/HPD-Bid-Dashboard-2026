"""The boxes HPD marked on the paperwork they sent back, for every recent "fix and resubmit" email
(scripts/hpd_marks.py does the reading). Gmail is read-only; nothing is sent.

Writes the "marks" part of public/data/correction_dates.json (the file the fetcher already saves): {threadId: {"omos": [...], "at": <HPD's email time>, "file": <pdf name>,
"pages": [{"form": "invoice", "page": 3, "boxes": ["Invoice #", ...]}]}}. Only box names; nothing written in them.
A thread is read again only when HPD sends a newer PDF in it.

    python scripts/fetch_hpd_marks.py [--days 90] [--limit 15]
"""
import argparse
import base64
import datetime
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "scripts"))
from fetch_hpd_conversations import BUNDLE, key  # noqa: E402
from private_data import decrypt_bytes  # noqa: E402
from hpd_marks import read_marks  # noqa: E402

OUT = os.path.join(ROOT, "public", "data", "correction_dates.json")
ASKS_FIX = re.compile(r"highlight|error|incomplete|missing|incorrect|correct|resubmit|rectif|blank", re.I)


def parts(p):
    yield p
    for c in p.get("parts", []) or []:
        yield from parts(c)


def wanted(threads, days):
    """Threads where HPD's newest PDF came with words asking for a fix: [(thread, hpd message)]."""
    cutoff = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=days)).isoformat()
    out = []
    for t in threads:
        for m in reversed(t.get("messages", [])):
            if m.get("hpd") and not m.get("mine") and any(str(f).lower().endswith(".pdf") for f in m.get("files", [])):
                if m["at"] >= cutoff and ASKS_FIX.search(m.get("subject", "") + " " + m.get("text", "")):
                    out.append((t, m))
                break
    return sorted(out, key=lambda x: x[1]["at"], reverse=True)


def main(days, limit):
    try:
        old = json.load(open(OUT, encoding="utf-8"))
    except (OSError, ValueError):
        old = {}
    marks = old.get("marks", {})
    if not os.path.exists(BUNDLE):
        print("No conversations yet (run fetch_hpd_conversations.py first).")
        return
    threads = json.loads(decrypt_bytes(open(BUNDLE, "rb").read(), key())).get("threads", [])
    todo = [(t, m) for t, m in wanted(threads, days) if marks.get(t["id"], {}).get("at") != m["at"]][:limit]
    print(f"HPD marked copies: {len(todo)} to read", flush=True)
    if not todo:
        return
    try:
        import fitz  # noqa: F401
        import pytesseract  # noqa: F401
        import numpy  # noqa: F401
    except ImportError:
        if not os.environ.get("GITHUB_ACTIONS"):
            raise
        import subprocess
        subprocess.run([sys.executable, "-m", "pip", "install", "--quiet", "--disable-pip-version-check", "pymupdf", "pytesseract", "numpy", "pillow"], check=True)
    from FetchrMatcherV5 import get_gmail_service
    service = get_gmail_service()
    for t, m in todo:
        th = service.users().threads().get(userId="me", id=t["id"], format="full").execute(num_retries=3)
        found = None
        for msg in reversed(th.get("messages", [])):
            frm = next((h["value"] for h in msg.get("payload", {}).get("headers", []) if h["name"].lower() == "from"), "")
            if "hpd.nyc.gov" not in frm.lower():
                continue
            part = next((p for p in parts(msg.get("payload", {})) if str(p.get("filename", "")).lower().endswith(".pdf")), None)
            if part:
                found = (msg, part)
                break
        if not found:
            continue
        msg, part = found
        data = part.get("body", {}).get("data")
        if not data:
            att = service.users().messages().attachments().get(userId="me", messageId=msg["id"], id=part["body"]["attachmentId"]).execute(num_retries=3)
            data = att["data"]
        try:
            pages = read_marks(base64.urlsafe_b64decode(data))
        except Exception as e:  # a PDF that won't open: skip it, try again next run
            print(f"  {t['omos']}: couldn't read ({type(e).__name__})")
            continue
        marks[t["id"]] = {"omos": t.get("omos", [])[:5], "at": m["at"], "file": str(part.get("filename", ""))[:100], "pages": pages}
        print(f"  {','.join(t.get('omos', [])[:2])}: " + "; ".join(f"{p['form']}: {', '.join(p['boxes']) or '-'}" for p in pages), flush=True)
    # Keep the newest 200.
    keep = dict(sorted(marks.items(), key=lambda kv: kv[1].get("at", ""), reverse=True)[:200])
    try:
        cur = json.load(open(OUT, encoding="utf-8"))
    except (OSError, ValueError):
        cur = {}
    cur["marks"] = keep
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(cur, f)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=90)
    ap.add_argument("--limit", type=int, default=15)
    a = ap.parse_args()
    main(a.days, a.limit)
