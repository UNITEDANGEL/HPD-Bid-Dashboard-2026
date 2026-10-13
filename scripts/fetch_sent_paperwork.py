"""What you sent HPD for each job, from your Gmail Sent folder (read-only): every email or fax with an
affidavit / invoice attachment named for an OMO ("EQ31761 AFF INVOICE.pdf", "SIGNED - ER05729 - Work
Completed.pdf", ...). For each OMO: when it was sent, to whom, the file, and which affidavit it was (no
access / refused access / work completed / completed by others) when the file name says so; otherwise
HPD's own closing reason tells the kind. Writes data/sent_paperwork.json; the follow-up report and the job card use it.

    python scripts/fetch_sent_paperwork.py [--since 2025/11/01]
"""
import argparse
import base64
import datetime
import io
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "sent_paperwork.json")
OMO = re.compile(r"\b(E[A-Z]\d{5})\b", re.I)
PAPER = re.compile(r"\b(AFF|AFFIDAVIT|INVOICE|SIGNED)\b", re.I)
OUTCOMES = [
    ("refused_access", re.compile(r"refus", re.I)),
    ("completed_by_others", re.compile(r"(completed|verified|done)\s+by\s+others|landlord\s+complied|owner\s+complied", re.I)),
    ("no_access", re.compile(r"no[\s_-]*access|unable\s+to\s+(gain|obtain)\s+access", re.I)),
    ("partial_work", re.compile(r"partial", re.I)),
    ("work_completed", re.compile(r"work\s+(was\s+)?completed|completed\s+work|work\s+complete\b", re.I)),
]


def outcome_of(text):
    for key, pattern in OUTCOMES:
        if pattern.search(text or ""):
            return key
    return ""


def parts(payload):
    stack, out = [payload], []
    while stack:
        p = stack.pop()
        out.append(p)
        stack += p.get("parts", []) or []
    return out


def pdf_text(data):
    try:
        import fitz  # PyMuPDF
        doc = fitz.open(stream=data, filetype="pdf")
        return " ".join(page.get_text() for page in doc)[:20000]
    except Exception:
        return ""


def main(since):
    sys.path.insert(0, ROOT)
    from FetchrMatcherV5 import get_gmail_service
    service = get_gmail_service()
    # Paperwork PDFs anywhere, and anything with attachments emailed to HPD staff (@hpd.nyc.gov): the
    # paperwork is often sent straight to the person who asked for it, under "OMO No: EQ31852 ..." subjects.
    queries = [f"in:sent has:attachment after:{since} (aff OR affidavit OR invoice OR signed)",
               f"in:sent has:attachment to:hpd.nyc.gov after:{since}"]
    ids, seen = [], set()
    for query in queries:
        token = None
        while True:
            resp = service.users().messages().list(userId="me", q=query, maxResults=500, pageToken=token).execute(num_retries=3)
            for m in resp.get("messages", []):
                if m["id"] not in seen:
                    seen.add(m["id"])
                    ids.append(m["id"])
            token = resp.get("nextPageToken")
            if not token:
                break
    print(f"Reading {len(ids)} sent emails with attachments...", flush=True)
    # Keep what was found before (a nightly run only reads recent emails).
    try:
        with open(OUT, encoding="utf-8") as f:
            sent = json.load(f).get("jobs", {})
    except (OSError, ValueError):
        sent = {}
    for i, mid in enumerate(ids):
        if i % 100 == 0:
            print(f"  {i}/{len(ids)}", flush=True)
        msg = service.users().messages().get(userId="me", id=mid, format="full").execute(num_retries=3)
        headers = {h["name"].lower(): h["value"] for h in msg.get("payload", {}).get("headers", [])}
        to = headers.get("to", "")
        subject = headers.get("subject", "")
        # Not paperwork: bids, and copies to yourself or tests.
        if re.search(r"\bBID\b", subject, re.I) and "humblefax" in to.lower():
            continue
        if re.search(r"^TEST\b|TEST-0001", subject, re.I):
            continue
        day = datetime.datetime.fromtimestamp(int(msg.get("internalDate", 0)) / 1000, datetime.timezone.utc).date().isoformat()
        to_hpd_staff = "hpd.nyc.gov" in to.lower() and "omobid@" not in to.lower()
        if to_hpd_staff:
            # Emailed to HPD staff with attachments: every OMO in the subject or an attachment name was sent.
            names = [p.get("filename") or "" for p in parts(msg.get("payload", {})) if p.get("filename")]
            found = {m.upper() for m in OMO.findall(subject + " " + " ".join(names))}
            for omo in found:
                entry = {"date": day, "to": to[:120], "file": (names[0] if names else "")[:120], "outcome": outcome_of(subject + " " + " ".join(names)), "subject": subject[:140], "via": "hpd-staff"}
                if entry not in sent.setdefault(omo, []):
                    sent[omo].append(entry)
            continue
        for p in parts(msg.get("payload", {})):
            name = p.get("filename") or ""
            if not name.lower().endswith(".pdf") or not PAPER.search(name):
                continue
            m = OMO.search(name)
            if not m:
                continue
            omo = m.group(1).upper()
            # Only the file name: the affidavit form prints every option (refused, partial, ...) as a
            # checkbox label, so its text can't tell which box was checked. HPD's own closing reason
            # (scripts/update-hpd-job-status.mjs) gives the kind of closing.
            outcome = outcome_of(name)
            entry = {"date": day, "to": to[:120], "file": name[:120], "outcome": outcome, "subject": subject[:140]}
            if entry not in sent.setdefault(omo, []):
                sent[omo].append(entry)
    for entries in sent.values():
        entries.sort(key=lambda e: e["date"])
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(), "since": since, "jobs": dict(sorted(sent.items()))}, f, indent=0)
    # For the app: only when it was sent and how many times (no recipients or subjects).
    public = os.path.join(ROOT, "public", "data", "sent_paperwork.json")
    with open(public, "w", encoding="utf-8") as f:
        json.dump({"generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(), "jobs": {o: {"sentAt": e[-1]["date"], "count": len(e)} for o, e in sorted(sent.items()) if e}}, f)
    typed = sum(1 for e in sent.values() if any(x["outcome"] for x in e))
    print(f"Sent paperwork: {len(sent)} OMOs with an affidavit / invoice sent ({typed} with the affidavit type read) from {len(ids)} emails since {since}")


if __name__ == "__main__":
    a = argparse.ArgumentParser()
    a.add_argument("--since", default="2025/11/01")
    main(a.parse_args().since)
