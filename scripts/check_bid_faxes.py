"""Confirms bid faxes from Gmail, so every phone shows them: for each bid fax sent to HumbleFax, finds
HumbleFax's reply ("Successful Transmission" / failure, the subject names the OMO) and saves the result on
the status server (key BID-<OMO>), with a line in the bid's log. A fax that left Gmail but never reached
the status server (the phone lost connection) is recorded from the email itself: OMO and address from the
subject, price from the attachment name ("ER07648_BID_970_...pdf"). Read-only on Gmail.

    python scripts/check_bid_faxes.py [--days 3] [--dry-run]

Scheduled every 5 minutes during the day (.github/workflows/bid-fax-watch.yml), but it only reads Gmail
while you are bidding: a bidding session is on ("Start bidding" in the app, key BIDDING-SESSION) or a fax is
still going through. Otherwise it stops right away.
"""
import argparse
import datetime
import json
import os
import re
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORKER = os.environ.get("HPD_STATUS_WORKER_URL", "https://hpd-status-worker.uac525.workers.dev").rstrip("/")
UA = {"User-Agent": "hpd-bid-dashboard fax check", "Content-Type": "application/json"}
SUBJECT = re.compile(r"(REVISED\s+)?Bid\s*-\s*OMO\s+([A-Z]{2}\d{5})\s*-\s*(.+?)\s*-\s*United Angel", re.I)
PRICE = re.compile(r"_BID_(\d+(?:\.\d+)?)_", re.I)
OMO = re.compile(r"\b([A-Z]{2}\d{5})\b")


def fax_result(subject, snippet):
    """Same rule as the app's server (server/drive-packages.mjs faxResult)."""
    text = f"{subject} {snippet}"
    if re.search(r"fail|unsuccessful|not (?:be )?(?:sent|delivered)|could not|error|busy|no answer|rejected", text, re.I):
        return "failed"
    if re.search(r"success|delivered|was sent|has been sent|complete|confirm", text, re.I):
        return "confirmed"
    return ""


def iso(ms):
    return datetime.datetime.fromtimestamp(int(ms) / 1000, datetime.timezone.utc).isoformat().replace("+00:00", "Z")


def http(method, path, body=None):
    req = urllib.request.Request(f"{WORKER}{path}", method=method, headers=UA, data=json.dumps(body).encode() if body is not None else None)
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode() or "{}")


def gmail_list(service, query):
    out, token = [], None
    while True:
        resp = service.users().messages().list(userId="me", q=query, maxResults=200, pageToken=token).execute(num_retries=3)
        out += resp.get("messages", [])
        token = resp.get("nextPageToken")
        if not token:
            return out


def headers(msg):
    return {h["name"].lower(): h["value"] for h in msg.get("payload", {}).get("headers", [])}


def attachments(part):
    names = [part["filename"]] if part.get("filename") else []
    for p in part.get("parts", []) or []:
        names += attachments(p)
    return names


def upcoming():
    try:
        with open(os.path.join(ROOT, "data", "upcoming_bids.json"), encoding="utf-8") as f:
            return {b["omo"]: b for b in json.load(f).get("bids", [])}
    except (OSError, ValueError):
        return {}


def should_check(overrides, today, force=False):
    """Read Gmail only while you're bidding: a session started today and not ended, or a fax still pending."""
    session = overrides.get("BIDDING-SESSION") or {}
    active = bool(session.get("active")) and session.get("day") == today
    pending = [k for k, v in overrides.items() if k.startswith("BID-") and isinstance(v, dict) and v.get("status") == "sent"]
    return force or active or bool(pending), active, pending


def main(days, dry, force=False):
    try:
        overrides = http("GET", "/overrides").get("overrides", {})
    except Exception as error:  # the status server is down: nothing to compare with or save to
        print(f"Bid faxes: status server not answering ({error}); will try again next run")
        return
    today = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=-4))).date().isoformat()
    go, active, pending = should_check(overrides, today, force)
    if not go:
        print("Bid faxes: no bidding session and no fax going through; nothing to check")
        return
    print(f"Bid faxes: {'bidding session on' if active else 'no session'}, {len(pending)} fax(es) going through")
    sys.path.insert(0, ROOT)
    from FetchrMatcherV5 import get_gmail_service
    service = get_gmail_service()
    since = (datetime.date.today() - datetime.timedelta(days=days)).strftime("%Y/%m/%d")

    sent = []  # faxes that left Gmail for HumbleFax
    for m in gmail_list(service, f"to:humblefax.com after:{since}"):
        msg = service.users().messages().get(userId="me", id=m["id"], format="full").execute(num_retries=3)
        h = headers(msg)
        sm = SUBJECT.search(h.get("subject", ""))
        if not sm or "humblefax.com" not in h.get("to", "").lower():
            continue
        pm = next((PRICE.search(n) for n in attachments(msg.get("payload", {})) if PRICE.search(n)), None)
        sent.append({"omo": sm.group(2).upper(), "revised": bool(sm.group(1)), "address": sm.group(3).strip(), "at": iso(msg["internalDate"]),
                     "price": float(pm.group(1)) if pm else None, "to": h.get("to", "").strip(), "id": m["id"]})

    replies = []  # HumbleFax's answers
    for m in gmail_list(service, f"from:humblefax.com after:{since}"):
        msg = service.users().messages().get(userId="me", id=m["id"], format="metadata", metadataHeaders=["Subject"]).execute(num_retries=3)
        subject = headers(msg).get("subject", "")
        replies.append({"subject": subject, "snippet": msg.get("snippet", ""), "at": iso(msg["internalDate"]), "omos": OMO.findall(subject.upper())})

    info = upcoming()
    changed = []
    for omo in sorted({s["omo"] for s in sent}):
        faxes = sorted([s for s in sent if s["omo"] == omo], key=lambda s: s["at"])
        last = faxes[-1]
        rec = overrides.get(f"BID-{omo}")
        if not rec or not rec.get("price"):
            # The fax went out but the phone never saved it to the status server: record it from the email.
            bid = info.get(omo, {})
            price = last["price"] or 0
            rec = {
                "omo": omo, "address": bid.get("address") or last["address"], "borough": bid.get("borough", ""),
                "bidDue": bid.get("bidDue", last["at"][:10]), "bidDueTime": bid.get("bidDueTime", ""),
                "price": price, "savedAt": faxes[0]["at"], "status": "sent", "sentAt": last["at"], "sentPrice": price,
                "faxTo": last["to"], "messageId": last["id"], "attempts": len(faxes),
                "log": [{"at": f["at"], "what": f"Fax sent to HPD at ${f['price']:,.2f}" if f["price"] else "Fax sent to HPD"} for f in faxes],
            }
            note = "recorded from Gmail (the phone hadn't saved it)"
        else:
            note = ""
        if rec.get("status") in ("confirmed", "failed") and not note:
            continue
        sent_at = rec.get("sentAt") or last["at"]
        # HumbleFax's reply for this job, after this fax went out (2 minutes of clock slack).
        cutoff = (datetime.datetime.fromisoformat(sent_at.replace("Z", "+00:00")) - datetime.timedelta(minutes=2)).isoformat()
        mine = [r for r in replies if omo in r["omos"] and r["at"].replace("Z", "+00:00") >= cutoff]
        mine.sort(key=lambda r: r["at"])
        result = next((fax_result(r["subject"], r["snippet"]) and r for r in mine if fax_result(r["subject"], r["snippet"])), None)
        if result:
            status = fax_result(result["subject"], result["snippet"])
            rec = {**rec, "status": status, "confirmedAt": result["at"], "faxNote": result["subject"][:200],
                   "log": [*(rec.get("log") or []), {"at": result["at"], "what": f"HumbleFax: {'Successful Transmission' if status == 'confirmed' else 'FAX FAILED'} ({result['subject'][:120]})"}]}
        elif not note:
            continue
        changed.append((omo, rec.get("status"), note))
        if not dry:
            http("POST", "/override", {"key": f"BID-{omo}", "patch": rec})
    for omo, status, note in changed:
        print(f"  {omo}: {status}{' · ' + note if note else ''}")
    print(f"Bid faxes: {len(sent)} sent in the last {days} days, {len(replies)} HumbleFax replies, {len(changed)} bids updated{' (dry run)' if dry else ''}")


if __name__ == "__main__":
    a = argparse.ArgumentParser()
    a.add_argument("--days", type=int, default=3)
    a.add_argument("--dry-run", action="store_true")
    a.add_argument("--force", action="store_true", help="check even with no session and nothing pending")
    o = a.parse_args()
    main(o.days, o.dry_run, o.force)
