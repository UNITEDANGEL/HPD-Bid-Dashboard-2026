"""HPD's own notices, readable inside the app: for each open payment-paperwork rejection, the email HPD sent
("Important Notification from HPD (OMO#: ...)": who, when, the full text) and its PDF attachment (the
DOCUMENT REJECTION NOTICE and any marked-up paperwork). Read-only Gmail.

They can name people and addresses, so they're stored encrypted like the tenant data (scripts/private_data.py):
  public/private/notices.json.enc        OMO -> [{date, from, subject, body, files}]
  public/private/notices/<file>.pdf.enc  the attachments
The app opens them through /api/private/notices and /api/private/notice/<file>.pdf with the owner's sign-in.

    python scripts/fetch_notice_documents.py [--all] [--omo EQ17038 ...]
"""
import argparse
import base64
import datetime
import html
import json
import os
import re
import sys
from zoneinfo import ZoneInfo

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "scripts"))
from private_data import decrypt_bytes, encrypt_bytes  # noqa: E402

NY = ZoneInfo("America/New_York")
OUT_DIR = os.path.join(ROOT, "public", "private")
BUNDLE = os.path.join(OUT_DIR, "notices.json.enc")
FILES = os.path.join(OUT_DIR, "notices")


def key():
    k = os.environ.get("HPD_PRIVATE_DATA_KEY", "")
    path = os.path.join(ROOT, "data", "private", "HPD_PRIVATE_DATA_KEY.txt")
    if not k and os.path.exists(path):
        k = open(path, encoding="utf-8").read()
    if not k.strip():
        sys.exit("HPD_PRIVATE_DATA_KEY missing")
    return k.strip()


def parts(payload):
    stack, out = [payload], []
    while stack:
        p = stack.pop()
        out.append(p)
        stack.extend(p.get("parts", []) or [])
    return out


def body_text(payload):
    """The email's text: the plain part, or the HTML part turned into text."""
    plain, rich = "", ""
    for p in parts(payload):
        data = (p.get("body") or {}).get("data")
        if not data or p.get("filename"):
            continue
        text = base64.urlsafe_b64decode(data).decode("utf-8", "replace")
        if p.get("mimeType") == "text/plain" and not plain:
            plain = text
        elif p.get("mimeType") == "text/html" and not rich:
            rich = text
    if not plain and rich:
        t = re.sub(r"(?is)<(script|style).*?</\1>", " ", rich)
        t = re.sub(r"(?i)<br\s*/?>|</p>|</div>|</tr>", "\n", t)
        plain = html.unescape(re.sub(r"<[^>]+>", " ", t))
    lines = [re.sub(r"[ \t]+", " ", line).strip() for line in plain.splitlines()]
    text = "\n".join(lines)
    return re.sub(r"\n{3,}", "\n\n", text).strip()[:8000]


def open_rejections():
    with open(os.path.join(ROOT, "public", "data", "hpd_requests.json"), encoding="utf-8") as f:
        req = json.load(f).get("jobs", {})
    try:
        with open(os.path.join(ROOT, "public", "data", "pip_paid.json"), encoding="utf-8") as f:
            pip = json.load(f).get("jobs", {})
    except (OSError, ValueError):
        pip = {}
    out = []
    for omo, r in req.items():
        if not r.get("rejectedAt"):
            continue
        answered = (r.get("repliedTs") or 0) > (r.get("rejectedTs") or 0)
        paid = (pip.get(omo) or {}).get("status") == "paid"
        if not answered and not paid:
            out.append(omo)
    return sorted(out)


def main(omos, everything):
    from FetchrMatcherV5 import get_gmail_service
    service = get_gmail_service()
    k = key()
    os.makedirs(FILES, exist_ok=True)
    bundle = json.loads(decrypt_bytes(open(BUNDLE, "rb").read(), k)) if os.path.exists(BUNDLE) else {}
    todo = omos or open_rejections()
    if not everything:
        todo = [o for o in todo if o not in bundle] or todo[:0]
    print(f"Reading HPD's notices for {len(todo)} jobs...", flush=True)
    for i, omo in enumerate(todo):
        q = f'from:hpd.nyc.gov subject:"{omo}" (subject:"Important Notification" OR subject:rejection OR subject:rejected)'
        resp = service.users().messages().list(userId="me", q=q, maxResults=5).execute(num_retries=3)
        items = []
        for ref in resp.get("messages", [])[:3]:  # newest first
            msg = service.users().messages().get(userId="me", id=ref["id"], format="full").execute(num_retries=3)
            h = {x["name"].lower(): x["value"] for x in msg.get("payload", {}).get("headers", [])}
            when = datetime.datetime.fromtimestamp(int(msg["internalDate"]) / 1000, NY)
            files = []
            for n, p in enumerate(parts(msg.get("payload", {}))):
                name = p.get("filename") or ""
                att = (p.get("body") or {}).get("attachmentId")
                if not (name.lower().endswith(".pdf") and att):
                    continue
                raw = service.users().messages().attachments().get(userId="me", messageId=ref["id"], id=att).execute(num_retries=3)
                safe = re.sub(r"[^A-Za-z0-9_.-]+", "_", f"{omo}_{when:%Y%m%d%H%M}_{n}_{name}")[:120]
                if not safe.lower().endswith(".pdf"):
                    safe += ".pdf"
                with open(os.path.join(FILES, safe + ".enc"), "wb") as f:
                    f.write(encrypt_bytes(base64.urlsafe_b64decode(raw["data"]), k))
                files.append({"file": safe, "name": name[:100]})
            items.append({"date": when.isoformat(), "from": h.get("from", "")[:120], "subject": h.get("subject", "")[:200], "body": body_text(msg.get("payload", {})), "files": files})
        if items:
            bundle[omo] = items
        print(f"  {i + 1}/{len(todo)} {omo}: {len(items)} email(s), {sum(len(x['files']) for x in items)} PDF(s)", flush=True)
    with open(BUNDLE, "wb") as f:
        f.write(encrypt_bytes(json.dumps(bundle).encode("utf-8"), k))
    print(f"HPD notices: {len(bundle)} jobs with HPD's emails kept (encrypted)")


if __name__ == "__main__":
    a = argparse.ArgumentParser()
    a.add_argument("--all", action="store_true", help="re-read jobs already kept")
    a.add_argument("--omo", nargs="*", default=[])
    args = a.parse_args()
    main([o.upper() for o in args.omo], args.all)
