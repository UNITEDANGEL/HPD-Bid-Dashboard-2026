"""Conversations with HPD staff, kept whole so nothing gets lost: every email thread with anyone at
hpd.nyc.gov (work orders, correction requests, AEP, the vendor tracker, status updates, rejections), both
HPD's messages and your replies, grouped by Gmail thread with the jobs (OMOs) they mention. A thread "waits on
you" when HPD wrote last. Invitations to bid are left out (they have their own screen).

Read-only Gmail. Names, emails and text are private: stored encrypted (scripts/private_data.py) in
public/private/conversations.json.enc; the app opens it through /api/private/conversations when signed in.

    python scripts/fetch_hpd_conversations.py [--days 180]     (first run reads 180 days, then only new mail)
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
BUNDLE = os.path.join(ROOT, "public", "private", "conversations.json.enc")
OMO = re.compile(r"(?<![A-Za-z0-9])(E[A-Za-z]\d{5}|K[A-Za-z]\d{5})(?!\d)")
SKIP_SUBJECT = re.compile(r"invitation to bid|bid invitation|request for bid|\bITB\b", re.I)
MAX_THREADS = 600


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
    return plain


def new_part(text):
    """Only what this message adds: cut the quoted earlier messages and the long signatures / disclaimers."""
    lines = text.replace("\r", "").split("\n")
    out = []
    for line in lines:
        s = line.strip()
        if re.match(r"^On .{5,120}wrote:\s*$", s) or re.match(r"^-{2,}\s*Original Message", s, re.I) or re.match(r"^From:\s.+", s) and out:
            break
        if s.startswith(">"):
            continue
        if re.match(r"^(CONFIDENTIALITY|This e-?mail(?: and any)?|NOTICE:|Disclaimer)", s, re.I):
            break
        out.append(re.sub(r"[ \t]+", " ", s))
    text = "\n".join(out)
    return re.sub(r"\n{3,}", "\n\n", text).strip()[:4000]


def who(sender):
    name = sender.split("<")[0].strip().strip('"')
    m = re.match(r"\s*([^,]+),\s*([^(]+)", name)  # "Gafur, Dilruba (HPD)"
    if m:
        return f"{m.group(2).strip()} {m.group(1).strip()}".replace("(HPD)", "").strip()[:40]
    return (name.replace("(HPD)", "").strip() or sender.split("<")[-1].rstrip(">"))[:40]


def kind_of(text):
    t = text.lower()
    if re.search(r"deemed unacceptable|reject|denied|not accepted", t):
        return "rejection"
    if re.search(r"correct|revis|resubmit|re-submit|fix|amend", t):
        return "correction"
    if re.search(r"\baep\b|alternative enforcement", t):
        return "AEP"
    if re.search(r"work order|change order|additional work|scope|\bomo\b.*(?:issued|assigned)", t):
        return "work order"
    if re.search(r"photo|video|affidavit|invoice", t):
        return "paperwork"
    if re.search(r"poor performance|past due|overdue|72 ?hr", t):
        return "past due"
    if re.search(r"award", t):
        return "award"
    return "message"


def main(days):
    from FetchrMatcherV5 import get_gmail_service
    service = get_gmail_service()
    k = key()
    me = service.users().getProfile(userId="me").execute().get("emailAddress", "").lower()
    old = json.loads(decrypt_bytes(open(BUNDLE, "rb").read(), k)) if os.path.exists(BUNDLE) else {"threads": []}
    threads = {t["id"]: t for t in old.get("threads", [])}
    since = days
    if threads and old.get("generatedAt"):
        last = datetime.datetime.fromisoformat(old["generatedAt"])
        since = max(2, (datetime.datetime.now(NY) - last).days + 2)
    q = f"(from:hpd.nyc.gov OR to:hpd.nyc.gov OR cc:hpd.nyc.gov) newer_than:{since}d"
    ids, token = set(), None
    while True:
        resp = service.users().messages().list(userId="me", q=q, maxResults=500, pageToken=token).execute(num_retries=3)
        ids |= {m["threadId"] for m in resp.get("messages", [])}
        token = resp.get("nextPageToken")
        if not token:
            break
    print(f"HPD conversations: {len(ids)} threads touched in the last {since} days", flush=True)
    for n, tid in enumerate(sorted(ids)):
        th = service.users().threads().get(userId="me", id=tid, format="full").execute(num_retries=3)
        msgs = []
        for msg in th.get("messages", []):
            h = {x["name"].lower(): x["value"] for x in msg.get("payload", {}).get("headers", [])}
            sender = h.get("from", "")
            frm = sender.lower()
            mine = bool(me) and me in frm
            hpd = "hpd.nyc.gov" in frm
            when = datetime.datetime.fromtimestamp(int(msg["internalDate"]) / 1000, NY)
            files = [p.get("filename") for p in parts(msg.get("payload", {})) if p.get("filename")]
            text = new_part(body_text(msg.get("payload", {})))
            msgs.append({"at": when.isoformat(), "from": "You" if mine else who(sender), "hpd": hpd, "mine": mine,
                         "subject": h.get("subject", "")[:200], "text": text, "files": list(dict.fromkeys(f[:100] for f in files))[:10]})
        if not msgs or SKIP_SUBJECT.search(msgs[0]["subject"]) or not any(m["hpd"] for m in msgs):
            threads.pop(tid, None)
            continue
        alltext = " ".join(m["subject"] + " " + m["text"] + " " + " ".join(m["files"]) for m in msgs)
        omos = sorted(set(m.group(1).upper() for m in OMO.finditer(alltext)))
        last = msgs[-1]
        people = sorted({m["from"] for m in msgs if m["hpd"]})
        threads[tid] = {
            "id": tid, "subject": msgs[0]["subject"], "omos": omos, "kind": kind_of(alltext), "people": people,
            "count": len(msgs), "lastAt": last["at"], "waiting": bool(last["hpd"] and not last["mine"]), "messages": msgs,
        }
        if (n + 1) % 25 == 0:
            print(f"  {n + 1}/{len(ids)}", flush=True)
    keep = sorted(threads.values(), key=lambda t: t["lastAt"], reverse=True)[:MAX_THREADS]
    # Waiting on you: a person at HPD wrote last, in the last 45 days, about something that needs an answer
    # (award letters and the automatic "Important Notification" rejections don't; those have their own lists).
    cutoff = (datetime.datetime.now(NY) - datetime.timedelta(days=45)).isoformat()
    # You sent something to HPD about the job after their message (scripts/fetch_hpd_requests.py: repliedTs).
    try:
        replied = {o: r.get("repliedTs", 0) for o, r in json.load(open(os.path.join(ROOT, "public", "data", "hpd_requests.json"), encoding="utf-8")).get("jobs", {}).items()}
    except (OSError, ValueError):
        replied = {}
    for t in keep:
        last = t["messages"][-1]
        person = last["hpd"] and not last["mine"] and not last["from"].lower().startswith("department of housing")
        last_ms = datetime.datetime.fromisoformat(t["lastAt"]).timestamp() * 1000
        answered = any(replied.get(o, 0) > last_ms for o in t["omos"])
        # "Received. Thanks" / "Noted" asks nothing.
        ack = len(last["text"]) < 160 and re.search(r"\b(received|thanks?|thank you|noted|got it|confirmed|ok|okay)\b", last["text"].lower()) and "?" not in last["text"]
        t["waiting"] = bool(person and not answered and not ack and t["kind"] not in ("award", "rejection") and t["lastAt"] >= cutoff)
    data = {"generatedAt": datetime.datetime.now(NY).isoformat(), "threads": keep}
    os.makedirs(os.path.dirname(BUNDLE), exist_ok=True)
    with open(BUNDLE, "wb") as f:
        f.write(encrypt_bytes(json.dumps(data).encode("utf-8"), k))
    waiting = sum(1 for t in keep if t["waiting"])
    print(f"HPD conversations: {len(keep)} threads kept (encrypted), {waiting} waiting on you")


if __name__ == "__main__":
    a = argparse.ArgumentParser()
    a.add_argument("--days", type=int, default=180)
    main(a.parse_args().days)
