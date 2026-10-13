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
OMO = re.compile(r"\b(E[A-Z]\d{5})\b", re.I)
ASK = re.compile(r"affidavit|invoice|photo|video|request|past\s+due|poor\s+performance|status\s+update|outstanding|missing", re.I)


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
        body = own_part(text_of(msg.get("payload", {})))
        if not ASK.search(subject + " " + body):
            continue
        day = datetime.datetime.fromtimestamp(int(msg.get("internalDate", 0)) / 1000, datetime.timezone.utc).date().isoformat()
        for omo in {m.upper() for m in OMO.findall(subject + "\n" + body)}:
            entry = {"date": day, "subject": subject[:140]}
            if entry not in asked.setdefault(omo, []):
                asked[omo].append(entry)
    for entries in asked.values():
        entries.sort(key=lambda e: e["date"])
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
        public[o] = {"askedAt": max(old["askedAt"], e[-1]["date"]), "count": max(old["count"], len(e))}
    with open(PUBLIC, "w", encoding="utf-8") as f:
        json.dump({"generatedAt": now, "jobs": dict(sorted(public.items()))}, f)
    print(f"HPD requests: {len(asked)} OMOs HPD asked about (paperwork / status) from {len(ids)} staff emails since {since}")


if __name__ == "__main__":
    a = argparse.ArgumentParser()
    a.add_argument("--since", default="2025/11/01")
    main(a.parse_args().since)
