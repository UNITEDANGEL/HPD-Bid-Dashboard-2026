"""Every job you were awarded since January 2025, from HPD's "CONFIRMATION OF AWARD" emails in Gmail
(read-only: subject, date and the attachment's file name, which starts with the OMO). The job database
(COA_Fetcher_2026.json) starts in December 2025, so without this, 2025 jobs you won would be counted as
won by other contractors in the bid stats. Writes data/your_awards.json; scripts/update-market-awards.mjs
uses it.

    python scripts/fetch_award_history.py [--since 2025/01/01]
"""
import argparse
import datetime
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "your_awards.json")
OMO = re.compile(r"\b([A-Z]{2}\d{5})\b")


def omo_of(message):
    names, stack = [], [message.get("payload", {})]
    while stack:
        part = stack.pop()
        if part.get("filename"):
            names.append(part["filename"].upper())
        stack += part.get("parts", []) or []
    subject = next((h["value"] for h in message.get("payload", {}).get("headers", []) if h["name"].lower() == "subject"), "")
    # "NYC HPD is awarding OMO # EP21410 to your firm", attachment "EP21410_031925044515.pdf".
    m = re.search(r"AWARDING OMO\s*#?\s*([A-Z]{2}\d{5})", str(message.get("snippet", "")).upper())
    if m:
        return m.group(1)
    for text in [*names, subject.upper()]:
        m = OMO.search(text)
        if m:
            return m.group(1)
    return ""


def main(since):
    sys.path.insert(0, ROOT)
    from FetchrMatcherV5 import get_gmail_service
    service = get_gmail_service()
    query = f'from:OMOBid@hpd.nyc.gov subject:"CONFIRMATION OF AWARD" after:{since}'
    ids, token = [], None
    while True:
        resp = service.users().messages().list(userId="me", q=query, maxResults=500, pageToken=token).execute(num_retries=3)
        ids += [m["id"] for m in resp.get("messages", [])]
        token = resp.get("nextPageToken")
        if not token:
            break
    try:
        with open(OUT, encoding="utf-8") as f:
            awards = json.load(f)
    except (OSError, ValueError):
        awards = {}
    missing = 0
    for i, mid in enumerate(ids):
        msg = service.users().messages().get(userId="me", id=mid, format="full").execute(num_retries=3)
        omo = omo_of(msg)
        if not omo:
            missing += 1
            continue
        day = datetime.datetime.fromtimestamp(int(msg.get("internalDate", 0)) / 1000, datetime.timezone.utc).date().isoformat()
        if omo not in awards or day < awards[omo]:
            awards[omo] = day
        if i % 100 == 0:
            print(f"  {i}/{len(ids)}", flush=True)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(dict(sorted(awards.items())), f, indent=0)
    print(f"Your awards: {len(awards)} OMOs from {len(ids)} award emails since {since} ({missing} without an OMO)")


if __name__ == "__main__":
    args = argparse.ArgumentParser()
    args.add_argument("--since", default="2025/01/01")
    main(args.parse_args().since)
