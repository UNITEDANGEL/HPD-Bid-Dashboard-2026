"""HPD staff asking for paperwork: "Request for Affidavits, Invoices, Photos and Videos", "Affidavit Request
completion Date Past Due", "72 Hr Poor Performance", "Status Update". Every OMO in those emails (subject, body,
attachment names) gets the date HPD asked, so the follow-up report can put "HPD asked for paperwork" first.

Read-only Gmail. Writes data/hpd_requests.json (with subjects, private) and public/data/hpd_requests.json
(only OMO -> last date asked and how many times: no names, no text).
"""
import argparse
import base64
import datetime
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "hpd_requests.json")
PUBLIC = os.path.join(ROOT, "public", "data", "hpd_requests.json")
OMO = re.compile(r"(?<![A-Za-z0-9])(E[A-Za-z]\d{5})(?!\d)")  # also "ER04466_1008...pdf": \b fails before "_"
# Who asked (short name only) and what they asked for. J. Lewis is the vendor tracker since 12 Oct 2026
# (before: K. Atkins; D. Gafur for AEP).
def staff_of(sender):
    name = sender.split("<")[0].strip().strip('"')
    m = re.match(r"\s*([^,]+),\s*([^(]+)", name)  # "Lewis, Joy-Ann (HPD)"
    if not m:
        return name.replace("(HPD)", "").strip()[:30] or "HPD"
    return f"{m.group(2).strip()[0]}. {m.group(1).strip()}"


def kind_of(text):
    t = text.lower()
    # "The documentation submitted for payment has been reviewed and deemed unacceptable" / "Rejections".
    if re.search(r"reject|deemed unacceptable|unacceptable|denied|not accepted|returned|incomplete|missing (?:signature|notar|date|photo)|cannot be processed|unable to process|does not match", t):
        return "payment paperwork rejected"
    if re.search(r"resubmit|re-submit|correct|revis", t):
        return "resubmit"
    if re.search(r"poor performance|past due|stop work|overdue", t):
        return "past due"
    if re.search(r"photo|video", t):
        return "photos / videos"
    if re.search(r"affidavit|invoice", t):
        return "affidavit / invoice"
    return "status"


ASK = re.compile(r"affidavit|invoice|photo|video|request|past\s+due|poor\s+performance|status\s+update|outstanding|missing|reject|returned|incomplete|denied|unacceptable", re.I)


def text_of(payload):
    out, stack = [], [payload]
    while stack:
        p = stack.pop()
        stack += p.get("parts", []) or []
        if p.get("filename"):
            out.append(p["filename"])
        data = (p.get("body") or {}).get("data")
        if data and p.get("mimeType", "").startswith("text/plain"):
            out.append(base64.urlsafe_b64decode(data).decode("utf-8", "ignore"))
    return "\n".join(out)


def own_part(text):
    """Only HPD's own message, not the quoted thread below it (it repeats older requests)."""
    cut = re.split(r"\n\s*(?:On .{5,80}wrote:|From:\s|-----Original Message-----|________________)", text, maxsplit=1)
    return cut[0]


def main(since):
    sys.path.insert(0, ROOT)
    from FetchrMatcherV5 import get_gmail_service
    service = get_gmail_service()
    query = f"from:hpd.nyc.gov -from:OMOBid@hpd.nyc.gov after:{since}"
    ids, token = [], None
    while True:
        resp = service.users().messages().list(userId="me", q=query, maxResults=500, pageToken=token).execute(num_retries=3)
        ids += [m["id"] for m in resp.get("messages", [])]
        token = resp.get("nextPageToken")
        if not token:
            break
    print(f"Reading {len(ids)} emails from HPD staff...", flush=True)
    asked = {}
    for mid in ids:
        msg = service.users().messages().get(userId="me", id=mid, format="full").execute(num_retries=3)
        headers = {h["name"].lower(): h["value"] for h in msg.get("payload", {}).get("headers", [])}
        subject = headers.get("subject", "")
        sender = headers.get("from", "")
        body = own_part(text_of(msg.get("payload", {})))
        if not ASK.search(subject + " " + body):
            continue
        day = datetime.datetime.fromtimestamp(int(msg.get("internalDate", 0)) / 1000, datetime.timezone.utc).date().isoformat()
        for omo in {m.upper() for m in OMO.findall(subject + "\n" + body)}:
            entry = {"date": day, "ts": int(msg.get("internalDate", 0)), "subject": subject[:140], "by": staff_of(sender), "kind": kind_of(subject + " " + body[:1500])}
            if entry not in asked.setdefault(omo, []):
                asked[omo].append(entry)
    for entries in asked.values():
        entries.sort(key=lambda e: e["ts"])
    # Who wrote last: every email you sent HPD staff about a job (subject, your own text, attachment names).
    replied, token, sent_ids = {}, None, []
    while True:
        resp = service.users().messages().list(userId="me", q=f"in:sent to:hpd.nyc.gov -to:OMOBid@hpd.nyc.gov after:{since}", maxResults=500, pageToken=token).execute(num_retries=3)
        sent_ids += [m["id"] for m in resp.get("messages", [])]
        token = resp.get("nextPageToken")
        if not token:
            break
    print(f"Reading {len(sent_ids)} emails you sent HPD staff...", flush=True)
    for mid in sent_ids:
        msg = service.users().messages().get(userId="me", id=mid, format="full").execute(num_retries=3)
        headers = {h["name"].lower(): h["value"] for h in msg.get("payload", {}).get("headers", [])}
        text = headers.get("subject", "") + "\n" + own_part(text_of(msg.get("payload", {})))
        ts = int(msg.get("internalDate", 0))
        for omo in {m.upper() for m in OMO.findall(text)}:
            replied[omo] = max(replied.get(omo, 0), ts)
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"generatedAt": now, "since": since, "jobs": dict(sorted(asked.items()))}, f, indent=0)
    # Keep what earlier runs found (a regular run only reads the last couple of weeks).
    try:
        with open(PUBLIC, encoding="utf-8") as f:
            public = json.load(f).get("jobs", {})
    except (OSError, ValueError):
        public = {}
    for o, e in asked.items():
        old = public.get(o, {"askedAt": "", "count": 0})
        last = e[-1]
        newer = last["date"] >= old["askedAt"]
        public[o] = {"askedAt": max(old["askedAt"], last["date"]), "count": max(old["count"], len(e)),
                     "by": last["by"] if newer else old.get("by", ""), "kind": last["kind"] if newer else old.get("kind", ""),
                     "askedTs": max(old.get("askedTs", 0), last["ts"])}
    for o, ts in replied.items():
        if o in public:
            public[o]["repliedTs"] = max(public[o].get("repliedTs", 0), ts)
    with open(PUBLIC, "w", encoding="utf-8") as f:
        json.dump({"generatedAt": now, "jobs": dict(sorted(public.items()))}, f)
    print(f"HPD requests: {len(asked)} OMOs HPD asked about (paperwork / status) from {len(ids)} staff emails since {since}")


if __name__ == "__main__":
    a = argparse.ArgumentParser()
    a.add_argument("--since", default="2025/11/01")
    main(a.parse_args().since)
