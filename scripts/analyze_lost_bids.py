"""Why bids were lost even though your price was the lowest (read-only Gmail; private output).

For each OMO: the invitation's bid due date / time (from the ITB PDF in the invitation email), every fax you
sent for it (time, to whom), and HumbleFax's answer (confirmed / failed). Flags: sent after the due time,
no fax confirmation, a failed fax, several faxes (resends), and whether HPD invited it again.
Writes data/private/lost_bids_review.json; prints one line per OMO.

    python scripts/analyze_lost_bids.py ER06823 ER06179 ...
"""
import base64
import datetime
import json
import os
import re
import sys
from zoneinfo import ZoneInfo

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, "scripts"))
NY = ZoneInfo("America/New_York")


def ny(ms):
    return datetime.datetime.fromtimestamp(int(ms) / 1000, NY)


def parts(payload):
    stack, out = [payload], []
    while stack:
        p = stack.pop()
        out.append(p)
        stack.extend(p.get("parts", []) or [])
    return out


def headers(msg):
    return {h["name"].lower(): h["value"] for h in msg.get("payload", {}).get("headers", [])}


def due_of(service, omo):
    """Bid due date / time from the newest invitation PDF for this OMO."""
    import fetch_upcoming_bids as ub
    r = service.users().messages().list(userId="me", q=f"has:attachment filename:{omo} -in:sent", maxResults=10).execute(num_retries=3)
    dues = []
    for ref in r.get("messages", []):
        msg = service.users().messages().get(userId="me", id=ref["id"], format="full").execute(num_retries=3)
        for p in parts(msg.get("payload", {})):
            name = p.get("filename") or ""
            att = (p.get("body") or {}).get("attachmentId")
            if not (name.upper().startswith(omo) and name.lower().endswith(".pdf") and att):
                continue
            path = os.path.join(ROOT, "node_modules", ".cache", name)
            os.makedirs(os.path.dirname(path), exist_ok=True)
            if not os.path.exists(path):
                raw = service.users().messages().attachments().get(userId="me", messageId=ref["id"], id=att).execute(num_retries=3)
                open(path, "wb").write(base64.urlsafe_b64decode(raw["data"]))
            if ub.is_award_letter(path):
                continue
            try:
                page1, last, *_ = ub.read_pdf(path)
                info = ub.parse_invitation_text(page1, last)
            except Exception:
                continue
            if info.get("bidDue"):
                dues.append({"bidDue": info["bidDue"], "bidDueTime": info.get("bidDueTime", ""), "file": name, "received": ny(msg["internalDate"]).isoformat()})
    return sorted(dues, key=lambda d: d["received"])


def faxes_of(service, omo):
    """Your sent faxes for this OMO and HumbleFax's answers."""
    sent, answers = [], []
    r = service.users().messages().list(userId="me", q=f"in:sent {omo}", maxResults=20).execute(num_retries=3)
    for ref in r.get("messages", []):
        msg = service.users().messages().get(userId="me", id=ref["id"], format="metadata").execute(num_retries=3)
        h = headers(msg)
        if "BID" in h.get("subject", "").upper() or "humblefax" in h.get("to", "").lower():
            sent.append({"at": ny(msg["internalDate"]).isoformat(), "to": h.get("to", "")[:80], "subject": h.get("subject", "")[:100]})
    r = service.users().messages().list(userId="me", q=f"from:humblefax {omo}", maxResults=20).execute(num_retries=3)
    for ref in r.get("messages", []):
        msg = service.users().messages().get(userId="me", id=ref["id"], format="metadata").execute(num_retries=3)
        h = headers(msg)
        subj = h.get("subject", "")
        kind = "confirmed" if re.search(r"success", subj, re.I) else "failed" if re.search(r"fail|unsuccess|error", subj, re.I) else "other"
        answers.append({"at": ny(msg["internalDate"]).isoformat(), "kind": kind, "subject": subj[:120]})
    return sorted(sent, key=lambda x: x["at"]), sorted(answers, key=lambda x: x["at"])


def due_datetime(d):
    if not d:
        return None
    m = re.match(r"(\d{1,2}):(\d{2})\s*([AP])", d.get("bidDueTime") or "", re.I)
    hh, mm = (int(m.group(1)) % 12 + (12 if m.group(3).upper() == "P" else 0), int(m.group(2))) if m else (23, 59)
    y, mo, da = map(int, d["bidDue"].split("-"))
    return datetime.datetime(y, mo, da, hh, mm, tzinfo=NY)


def main(omos):
    from FetchrMatcherV5 import get_gmail_service
    service = get_gmail_service()
    out = {}
    for omo in omos:
        dues = due_of(service, omo)
        sent, answers = faxes_of(service, omo)
        flags = []
        last_due = due_datetime(dues[-1]) if dues else None
        first_due = due_datetime(dues[0]) if dues else None
        if len({(d["bidDue"], d["bidDueTime"]) for d in dues}) > 1:
            flags.append(f"invited {len(dues)} times (due {', '.join(d['bidDue'] + ' ' + d['bidDueTime'] for d in dues)})")
        if sent and first_due:
            late = [s for s in sent if datetime.datetime.fromisoformat(s["at"]) > (last_due or first_due)]
            if len(late) == len(sent):
                flags.append(f"every fax sent AFTER the due time ({(last_due or first_due).strftime('%m/%d %I:%M %p')})")
            elif late:
                flags.append(f"{len(late)} of {len(sent)} faxes after the due time")
        if not sent:
            flags.append("no sent fax found in Gmail")
        if len(sent) > 1:
            flags.append(f"{len(sent)} faxes sent")
        kinds = [a["kind"] for a in answers]
        if "failed" in kinds:
            flags.append(f"{kinds.count('failed')} failed fax(es)")
        if "confirmed" not in kinds:
            flags.append("NO HumbleFax confirmation")
        out[omo] = {"dues": dues, "sent": sent, "answers": answers, "flags": flags}
        print(f"{omo}: due {dues[-1]['bidDue'] + ' ' + dues[-1]['bidDueTime'] if dues else '?'} | sent {', '.join(s['at'][5:16] for s in sent) or '-'} | answers {', '.join(a['kind'] + ' ' + a['at'][5:16] for a in answers) or '-'}")
        print(f"   -> {'; '.join(flags) or 'nothing wrong found'}", flush=True)
    with open(os.path.join(ROOT, "data", "private", "lost_bids_review.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, indent=1)


if __name__ == "__main__":
    main([o.upper() for o in sys.argv[1:]])
