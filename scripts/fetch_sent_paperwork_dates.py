"""The dates on the paperwork you already sent HPD, read from the PDFs in your Gmail Sent folder (read-only),
so a correction re-uses them instead of asking you to type them again (or, worse, printing today's date).

For every job HPD rejected (data/hpd_requests.json), the newest sent affidavit / invoice PDF for that OMO is
opened (text, or OCR for a scanned signed copy) and these are read:
  work affidavit:     "performed beginning on <date> and completed on <date>"
  invoice:            "Date Work Started <date>", "Date Work Completed <date>" (or START / COMPLETE DATE)
  no-work affidavit:  access attempts "on <date> and <date>", telephone "on <date> and <date>",
                      "arrived at the work site on <date>" (done by others / refused)
Writes data/sent_paperwork_dates.json (with the file and email date) and public/data/correction_dates.json
(OMO -> dates only; nothing private).

    python scripts/fetch_sent_paperwork_dates.py [--omo EQ17038 ...] [--all] [--limit 10]

Runs with the GitHub fetcher too (31 Oct): there the private file isn't kept, so the public file's dates are the
starting point, and the public file also keeps "checked" (OMO -> day looked for, nothing found) so a job with no
sent paperwork is looked for again only after RETRY_DAYS, not every run. Newest rejections first.
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
PRIVATE_OUT = os.path.join(ROOT, "data", "sent_paperwork_dates.json")
PUBLIC_OUT = os.path.join(ROOT, "public", "data", "correction_dates.json")
DATE = r"(\d{1,2}/\d{1,2}/\d{2,4})"
NL = chr(10)
RETRY_DAYS = 14


def iso(d):
    m = re.match(r"(\d{1,2})/(\d{1,2})/(\d{2,4})$", d or "")
    if not m:
        return ""
    y = int(m.group(3))
    y = y + 2000 if y < 100 else y
    try:
        return datetime.date(y, int(m.group(1)), int(m.group(2))).isoformat()
    except ValueError:
        return ""


def flat(text):
    return re.sub(r"\s+", " ", text or "").strip()


def read_dates(text):
    """Dates found in the sent paperwork's text (affidavit + invoice)."""
    t = flat(text)
    out = {}
    m = re.search(r"performed beginning on\s*_*\s*" + DATE + r".{0,40}?completed on\s*_*\s*" + DATE, t, re.I)
    if m:
        out["workStart"], out["workComplete"] = iso(m.group(1)), iso(m.group(2))
    m = re.search(r"Date Work Started\s*" + DATE + r".{0,80}?Date Work Completed\s*" + DATE, t, re.I)
    if m:
        out.setdefault("workStart", iso(m.group(1)))
        out.setdefault("workComplete", iso(m.group(2)))
    m = re.search(r"gain access on\s*_*\s*" + DATE + r"\s*_*\s*and\s*_*\s*" + DATE, t, re.I)
    if m:
        out["attempt1"], out["attempt2"] = iso(m.group(1)), iso(m.group(2))
    m = re.search(r"telephone on\s*_*\s*" + DATE + r"(?:\s*_*\s*and\s*_*\s*" + DATE + ")?", t, re.I)
    if m:
        out["call1"] = iso(m.group(1))
        if m.group(2):
            out["call2"] = iso(m.group(2))
    # 5. completed by others / 6. being performed by others / 7. denied access: "arrived at the work site on <date>"
    for m in re.finditer(r"(\d)\.\s*When I arrived at the work site on\s*_*\s*" + DATE, t, re.I):
        key = {"5": "doneByOthers", "6": "doneByOthers", "7": "refused"}.get(m.group(1))
        if key:
            out[key] = iso(m.group(2))
    if "workStart" not in out:
        m = re.search(r"START DATE\s*" + DATE + r".{0,60}?COMPLETE DATE\s*" + DATE, t, re.I)
        if m:
            out["workStart"], out["workComplete"] = iso(m.group(1)), iso(m.group(2))
    kind = ""
    if re.search(r"NO WORK PERFORMED AFFIDAVIT", t, re.I):
        kind = "no_access" if "attempt1" in out else "refused_access" if "refused" in out else "completed_by_others" if "doneByOthers" in out else "no_work"
    elif re.search(r"WORK PERFORMED AFFIDAVIT", t, re.I) or "workStart" in out:
        kind = "work_completed"
    if kind:
        out["outcome"] = kind
    return {k: v for k, v in out.items() if v}


TEMPLATES = {
    "work": ["public/templates/work-performed-affidavit-2025.pdf", "public/templates/work-performed-affidavit.pdf"],
    "no_work": ["public/templates/no-work-performed-affidavit-2025.pdf", "public/templates/no-work-performed-affidavit.pdf"],
}
_BOXES = {}


def boxes(path):
    """The form's named boxes: {name: [(page, rect), ...]} (same forms the paperwork page fills)."""
    if path not in _BOXES:
        import fitz
        out = {}
        with fitz.open(os.path.join(ROOT, path)) as doc:
            for page in doc:
                for w in page.widgets():
                    out.setdefault(w.field_name, []).append((page.number, fitz.Rect(w.rect)))
        _BOXES[path] = out
    return _BOXES[path]


def read_boxes(doc, first, path):
    """What is printed inside each box of the affidavit that starts on page `first`."""
    import fitz
    values = {}
    for name, places in boxes(path).items():
        for page_no, rect in places:
            if first + page_no >= len(doc):
                continue
            area = fitz.Rect(rect.x0 - 4, rect.y0 - 6, rect.x1 + 4, rect.y1 + 4)
            words = [w for w in doc[first + page_no].get_text("words") if area.contains(fitz.Point((w[0] + w[2]) / 2, (w[1] + w[3]) / 2))]
            text = " ".join(w[4] for w in sorted(words, key=lambda w: (round(w[1]), w[0]))).strip(" _")
            if text:
                values.setdefault(name, text)
    return values


def read_affidavit(data, omo):
    """Dates from a sent affidavit PDF, read by box position. Empty when it isn't this job's affidavit."""
    import fitz
    with fitz.open(stream=data, filetype="pdf") as doc:
        texts = [p.get_text() for p in doc]
        if any("INVITATION TO BID" in t.upper() for t in texts[:2]):
            return {}
        first = next((i for i, t in enumerate(texts) if re.search(r"WORK\s+PERFORMED\s+AFFIDAVIT", t, re.I)), None)
        if first is None:
            return {}
        kind = "no_work" if re.search(r"NO\s+WORK\s+PERFORMED", texts[first], re.I) else "work"
        best = {}
        for path in TEMPLATES[kind]:
            v = read_boxes(doc, first, path)
            if omo.upper() in " ".join(v.get(k, "") for k in ("OMO", "OMO Body", "OMO Header2")).upper().replace(" ", ""):
                best = v
                break
        if not best:
            return {}
    d = lambda k: iso((re.search(DATE, best.get(k, "")) or [None, ""])[1] if re.search(DATE, best.get(k, "")) else "")
    out = {"awardDate": d("Award Date")}
    if kind == "work":
        out.update(workStart=d("Start Date"), workComplete=d("Complete Date"))
        out["outcome"] = "partial_work_completed" if best.get("Partial Amount") or best.get("Interrupted Amount") else "work_completed"
    else:
        out.update(attempt1=d("Attempt1 Date"), attempt2=d("Attempt2 Date"), call1=d("Phone1 Date"), call2=d("Phone2 Date"),
                   doneByOthers=d("WorkSite Date5") or d("WorkSite Date6"), refused=d("Denied Date"))
        out["outcome"] = "no_access" if out["attempt1"] else "refused_access" if out["refused"] else "completed_by_others" if out["doneByOthers"] else ""
    return {k: v for k, v in out.items() if v}


def pdf_text(data):
    import fitz  # PyMuPDF
    with fitz.open(stream=data, filetype="pdf") as doc:
        text = NL.join(p.get_text() for p in doc)
        if len(flat(text)) > 200:
            return text
        # A scanned signed copy: read it with OCR.
        try:
            import pytesseract
            from PIL import Image
            return NL.join(pytesseract.image_to_string(Image.open(io.BytesIO(p.get_pixmap(dpi=200).tobytes("png")))) for p in doc)
        except Exception:
            return text


def parts(payload):
    stack, out = [payload], []
    while stack:
        p = stack.pop()
        out.append(p)
        stack.extend(p.get("parts", []) or [])
    return out


def dates_for(service, omo):
    """Newest sent PDF for this OMO that has dates."""
    # By the attachment's name first: a plain search for the OMO also finds every vendor-tracking email that only
    # mentions it, and the email with its PDF falls past the first 20 (31 Oct: EQ14962, EQ20456).
    refs = []
    for q in (f"in:sent filename:{omo}", f"in:sent has:attachment {omo}"):
        resp = service.users().messages().list(userId="me", q=q, maxResults=20).execute(num_retries=3)
        refs = resp.get("messages", [])
        if refs:
            break
    found = None
    for ref in refs:  # newest first
        msg = service.users().messages().get(userId="me", id=ref["id"], format="full").execute(num_retries=3)
        day = datetime.datetime.fromtimestamp(int(msg.get("internalDate", 0)) / 1000, datetime.timezone.utc).date().isoformat()
        merged, files = {}, []
        for p in parts(msg.get("payload", {})):
            name = p.get("filename") or ""
            att = (p.get("body") or {}).get("attachmentId")
            if not name.lower().endswith(".pdf") or not att:
                continue
            # Only this job's own file (one email can carry many jobs' PDFs).
            if omo.upper() not in name.upper().replace(" ", ""):
                continue
            raw = service.users().messages().attachments().get(userId="me", messageId=ref["id"], id=att).execute(num_retries=3)
            data = base64.urlsafe_b64decode(raw["data"])
            got = read_affidavit(data, omo)
            if not got:
                got = read_dates(pdf_text(data))
            for k, v in got.items():
                merged.setdefault(k, v)
            if got:
                files.append(name[:120])
        if merged:
            found = {**merged, "sentAt": day, "files": files}
            break
    return found


def load_json(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def to_read(req, known, checked, everything, today):
    """Rejected jobs still to look for, newest rejection first: not on file, and not looked for in RETRY_DAYS."""
    def due(o):
        if everything:
            return True
        if o in known:
            return False
        try:
            return (today - datetime.date.fromisoformat(checked.get(o, ""))).days >= RETRY_DAYS
        except ValueError:
            return True
    return [o for o, r in sorted(req.items(), key=lambda kv: kv[1].get("rejectedAt", ""), reverse=True) if r.get("rejectedAt") and due(o)]


def main(omos, everything, limit=0):
    sys.path.insert(0, ROOT)
    from FetchrMatcherV5 import get_gmail_service
    public = load_json(PUBLIC_OUT)
    # The private file (with the file names) where it exists; else the public dates (the GitHub fetcher).
    known = {**public.get("jobs", {}), **load_json(PRIVATE_OUT).get("jobs", {})}
    checked = dict(public.get("checked", {}))
    today = datetime.datetime.now(datetime.timezone.utc).date()
    if not omos:
        # The public summary (OMO -> rejectedAt ...); the private file keeps every email per OMO.
        req = load_json(os.path.join(ROOT, "public", "data", "hpd_requests.json")).get("jobs", {})
        omos = to_read(req, known, checked, everything, today)
    if limit:
        omos = omos[:limit]
    if not omos:
        print("Sent paperwork dates: nothing new to read")
        return
    service = get_gmail_service()
    print(f"Reading the sent paperwork of {len(omos)} jobs...", flush=True)
    found = 0
    for i, omo in enumerate(omos):
        try:
            got = dates_for(service, omo)
        except Exception as error:
            print(f"  {omo}: {error}")
            continue
        if got:
            known[omo] = got
            checked.pop(omo, None)
            found += 1
        else:
            checked[omo] = today.isoformat()
        print(f"  {i + 1}/{len(omos)} {omo}: {json.dumps({k: v for k, v in (got or {}).items() if k != 'files'}) if got else 'no dates found'}", flush=True)
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    if os.path.isdir(os.path.dirname(PRIVATE_OUT)):
        with open(PRIVATE_OUT, "w", encoding="utf-8") as f:
            json.dump({"generatedAt": now, "jobs": dict(sorted(known.items()))}, f, indent=1)
    with open(PUBLIC_OUT, "w", encoding="utf-8") as f:
        json.dump({"generatedAt": now, "jobs": {o: {k: v for k, v in d.items() if k != "files"} for o, d in sorted(known.items())},
                   "checked": dict(sorted(checked.items()))}, f)
    print(f"Sent paperwork dates: {found} of {len(omos)} jobs read; {len(known)} on file")


if __name__ == "__main__":
    a = argparse.ArgumentParser()
    a.add_argument("--omo", nargs="*", default=[])
    a.add_argument("--all", action="store_true", help="re-read jobs already on file too")
    a.add_argument("--limit", type=int, default=0, help="read at most this many jobs (newest rejections first)")
    args = a.parse_args()
    main([o.upper() for o in args.omo], args.all, args.limit)
