"""Upcoming bids for the field map: HPD "Invitation to Bid" emails that are not awarded yet.

Run by the nightly fetcher (scripts/run-safe-fetcher-update.js). Same approach as the bid filler in
OneDrive\\HPD_BIDS_FILLER\\Filler_Code: every PDF from OMOBid@hpd.nyc.gov in the last days, page 1
read with OCR for OMO #, BID DUE, work dates, address and boro (the last page's BUILDING ADDRESS /
BOROUGH as a fallback). Jobs already awarded (in data/COA_Fetcher_2026.json) are left out. Each bid
gets a map location from NYC GeoSearch. Writes data/ and public/data/upcoming_bids.json and copies
the ITB PDF to public/documents/itb/ so the map can open it.

    python scripts/fetch_upcoming_bids.py [--days 14]
    python scripts/fetch_upcoming_bids.py --parse FILE.pdf   (read one PDF, print what was found)
"""
import argparse
import base64
import datetime
import io
import json
import os
import re
import shutil
import sys
import time
import urllib.parse
import urllib.request
from zoneinfo import ZoneInfo

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NY = ZoneInfo("America/New_York")
DOWNLOAD_DIR = os.path.join(ROOT, "ITB_Downloads_V5")
OUT_FILES = [os.path.join(ROOT, "data", "upcoming_bids.json"), os.path.join(ROOT, "public", "data", "upcoming_bids.json")]
PUBLIC_ITB_DIR = os.path.join(ROOT, "public", "documents", "itb")
KEEP_PAST_DAYS = 7  # a bid stays on the map a week after it's due, while the award is pending
BOROS = {"MANHATTAN": "MN", "BROOKLYN": "BK", "QUEENS": "QN", "BRONX": "BX", "STATEN ISLAND": "SI"}


def clean(text):
    return re.sub(r"\s+", " ", text or "").strip()


def normalize_omo(raw):
    """HPD OMOs are two letters and five digits. OCR reads 0 as O ("ERO7193") and sometimes adds a
    leading zero ("ER007032" for ER07032), so keep the last five digits."""
    m = re.match(r"([A-Z]{2})([0-9O]{5,6})$", raw.upper().replace(" ", ""))
    return f"{m.group(1)}{m.group(2).replace('O', '0')[-5:]}" if m else ""


def omo_from_filename(name):
    """Invitation files are named after the OMO: "ER07193_100626035429.pdf"."""
    m = re.match(r"([A-Z]{2}\d{5})_", os.path.basename(name).upper())
    return m.group(1) if m else ""


def parse_date(text):
    m = re.search(r"(\d{1,2})/(\d{1,2})/(\d{2,4})", text or "")
    if not m:
        return ""
    year = int(m.group(3)) + (2000 if len(m.group(3)) == 2 else 0)
    try:
        return datetime.date(year, int(m.group(1)), int(m.group(2))).isoformat()
    except ValueError:
        return ""


def parse_invitation_text(page1, last_page=""):
    """What an invitation's page 1 (OCR text) says. Pure: tested without any PDF."""
    flat = clean(page1)
    out = {"omo": "", "bidDue": "", "bidDueTime": "", "workStart": "", "workCompletion": "", "address": "", "borough": ""}
    m = re.search(r"OMO\s*#?\s*:?\s*([A-Z]{2}\s?[0-9O]{5,6})", flat, re.I)
    if m:
        out["omo"] = normalize_omo(m.group(1))
    m = re.search(r"BID\s*DUE\s*:?\s*(\d{1,2}/\d{1,2}/\d{2,4})\s*(\d{1,2}:\d{2}\s*[AP]\.?M\.?)?", flat, re.I)
    if m:
        out["bidDue"] = parse_date(m.group(1))
        out["bidDueTime"] = re.sub(r"\.", "", (m.group(2) or "").upper()).replace(" ", " ")
    m = re.search(r"Work\s*Start\s*Date\s*:?\s*(\d{1,2}/\d{1,2}/\d{2,4})", flat, re.I)
    if m:
        out["workStart"] = parse_date(m.group(1))
    m = re.search(r"Work\s*Completion\s*Date\s*:?\s*(\d{1,2}/\d{1,2}/\d{2,4})", flat, re.I)
    if m:
        out["workCompletion"] = parse_date(m.group(1))
    m = re.search(r"Building\s*Address\s*:?\s*(.+?)(?=\s+(?:Work\s*Completion|Boro\b|This is an invitation)|$)", flat, re.I)
    if m:
        out["address"] = clean(m.group(1)).upper()
    m = re.search(r"Boro(?:ugh)?\s*:?\s*(Manhattan|Brooklyn|Queens|Bronx|Staten\s*Island)", flat, re.I)
    if m:
        out["borough"] = BOROS[clean(m.group(1)).upper()]
    # The OMO's last page prints BUILDING ADDRESS / BOROUGH as real text: more reliable than OCR
    # (OCR can drop spaces, "41-15 50 STREET" -> "41-1550 STREET"), so it wins when present.
    last = clean(last_page)
    m = re.search(r"BUILDING ADDRESS:\s*(.+?)\s+BOROUGH:", last, re.I)
    if m:
        out["address"] = clean(m.group(1)).upper()
    if not out["borough"]:
        m = re.search(r"BOROUGH:\s*(MANHATTAN|BROOKLYN|QUEENS|BRONX|STATEN ISLAND)", last, re.I)
        if m:
            out["borough"] = BOROS[m.group(1).upper()]
    return out


def job_description(page3_text):
    """The OMO's job description (page 3): after "Job Description:", without HPD's standard closing
    lines (contact numbers, affidavit fax), which aren't part of the work."""
    text = page3_text or ""
    start = re.search(r"Job\s*Description\s*:", text, re.I)
    if start:
        text = text[start.end():]
    stop = re.search(r"CONTRACTOR\s+MUST\s+CONTACT|IF\s+LANDLORD\s+REFUSES|IF\s+NO\s+WORK\s+IS\s+PERFORMED|NOTE\s*:\s*CONTRACTOR", text, re.I)
    if stop:
        text = text[:stop.start()]
    return clean(text)


def read_pdf(path):
    import fitz  # PyMuPDF
    import pytesseract
    from PIL import Image
    doc = fitz.open(path)
    page1 = pytesseract.image_to_string(Image.open(io.BytesIO(doc[0].get_pixmap(dpi=300).tobytes("png"))))
    last = doc[-1].get_text() if len(doc) else ""
    description = job_description(doc[2].get_text()) if len(doc) >= 3 else ""
    return page1, last, description


# Where the bid package gets filled in, found from the labels printed on each invitation (so a form
# that shifts a little still lines up). Points are in PDF space (origin bottom-left, page unrotated)
# with the text angle, ready for pdf-lib in the app (lib/bid-fill.ts). Same fields as the bid filler
# in Filler_Code, plus the bid price on page 1, page 2 and the Work Description Form (last page).
FIELD_LABELS = [
    # key, page ("first" / 2 / 3 / "last"), label, where to write relative to the label
    ("price", "first", "BID PRICE: $", "right"),
    ("contractor", "first", "Contractor:", "right"),
    ("owner", "first", "Owner:", "right"),
    ("address", "first", "Address:", "right"),
    ("signature", "first", "Signature:", "right"),
    ("date", "first", "Date:", "right"),
    ("phone", "first", "Phone No.:", "right"),
    ("fax", "first", "Fax Number:", "right"),
    ("pageTotal", 2, "PAGE TOTAL", "below-right"),
    ("bidAmount", "last", "BID AMOUNT $", "right"),
    ("preparedBy", "last", "PREPARED BY:", "right"),
    ("lastSignature", "last", "SIGNATURE:", "right"),
    ("lastDate", "last", "DATE:", "right"),
    ("lastContractor", "last", "CONTRACTOR:", "right"),
    ("permitNo", "last", "PERMIT REQUIRED:", "permit-no"),
    ("bridgeNo", "last", "SIDEWALK BRIDGE REQUIRED:", "permit-no"),
    ("description", "last", "MATERIAL(S)", "box"),
]


def _to_pdf(page, x, y):
    """A point seen on the page (as displayed, top-left origin) -> unrotated PDF space."""
    import fitz
    point = fitz.Point(x, y) * page.derotation_matrix
    return round(point.x, 1), round(page.mediabox.height - point.y, 1)


def bid_fields(path):
    import fitz
    doc = fitz.open(path)
    pages = {"first": 0, 2: 1, 3: 2, "last": len(doc) - 1}
    fields = {}
    for key, where, label, how in FIELD_LABELS:
        index = pages[where]
        if index >= len(doc):
            continue
        page = doc[index]
        hits = page.search_for(label)
        if not hits:
            continue
        # The last page's "DATE:" / "SIGNATURE:" are the footer ones, not the header's.
        r = max(hits, key=lambda h: h.y0) if key in ("lastDate", "lastSignature") else hits[0]
        if how == "right":
            x, y = r.x1 + 4, r.y1 - 1.5
        elif how == "below-right":  # PAGE TOTAL AMOUNT $ sits on two lines; write after the "$"
            dollar = [h for h in page.search_for("$") if h.y0 > r.y0 and h.x0 > r.x0][:1]
            x, y = (dollar[0].x1 + 6, dollar[0].y1 - 1.5) if dollar else (r.x1 + 40, r.y1 + 12)
        elif how == "permit-no":  # the line after "NO:"
            no = sorted((h for h in page.search_for("NO:") if abs(h.y0 - r.y0) < 4 and h.x0 > r.x1), key=lambda h: h.x0)[:1]
            if not no:
                continue
            x, y = no[0].x1 + 14, no[0].y1 - 1.5
        else:  # box: the description area under the table header, right of the APT/LOCATION column
            x, y = r.x0, r.y1 + 14
        px, py = _to_pdf(page, x, y)
        field = {"page": index, "x": px, "y": py, "rotate": page.rotation}
        if how == "box":
            field["width"] = round(page.rect.width - r.x0 - 30, 1)
        fields[key] = field
    # Page 3 (the OMO's description page): the company / date stamp at the top, as the filler does.
    if len(doc) >= 3:
        px, py = _to_pdf(doc[2], 24, 18)
        fields["stamp3"] = {"page": 2, "x": px, "y": py, "rotate": doc[2].rotation}
    return {"pages": len(doc), "fields": fields}


def geocode(address, borough):
    query = f"{address}, {next((k for k, v in BOROS.items() if v == borough), '')}, NY"
    url = "https://geosearch.planninglabs.nyc/v2/search?size=1&text=" + urllib.parse.quote(query)
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "HPD-Bid-Dashboard-2026 upcoming bids"})
        with urllib.request.urlopen(req, timeout=15) as res:
            feature = (json.load(res).get("features") or [None])[0]
        lng, lat = feature["geometry"]["coordinates"]
        if 40.45 < lat < 40.95 and -74.3 < lng < -73.65:
            return round(lat, 6), round(lng, 6)
    except Exception as error:  # no location: the bid is still listed, just without a pin
        print(f"  geocode failed for {address}: {error}")
    return None, None


def awarded_omos():
    with open(os.path.join(ROOT, "data", "COA_Fetcher_2026.json"), encoding="utf-8") as f:
        return {str(j.get("OMO", "")).upper() for j in json.load(f)}


def previous_bids():
    try:
        with open(OUT_FILES[0], encoding="utf-8") as f:
            return {b["omo"]: b for b in json.load(f).get("bids", [])}
    except (OSError, ValueError):
        return {}


def fetch(days):
    sys.path.insert(0, ROOT)
    from FetchrMatcherV5 import get_gmail_service
    service = get_gmail_service()
    since = (datetime.datetime.now(NY) - datetime.timedelta(days=days)).strftime("%Y/%m/%d")
    query = f'from:OMOBid@hpd.nyc.gov "INVITATION TO BID" has:attachment filename:pdf after:{since}'
    print(f"UPCOMING BIDS QUERY: {query}")
    messages, token = [], None
    while True:
        resp = service.users().messages().list(userId="me", q=query, maxResults=100, pageToken=token).execute(num_retries=3)
        messages += resp.get("messages", [])
        token = resp.get("nextPageToken")
        if not token:
            break
    os.makedirs(DOWNLOAD_DIR, exist_ok=True)
    awarded, known, found = awarded_omos(), previous_bids(), {}
    today = datetime.datetime.now(NY).date()
    for msg in messages:
        data = service.users().messages().get(userId="me", id=msg["id"]).execute(num_retries=3)
        received = int(data.get("internalDate", 0))
        parts, stack = [], [data.get("payload", {})]
        while stack:
            part = stack.pop()
            parts.append(part)
            stack += part.get("parts", []) or []
        for part in parts:
            name = part.get("filename") or ""
            attachment = (part.get("body") or {}).get("attachmentId")
            if not name.lower().endswith(".pdf") or not attachment:
                continue
            path = os.path.join(DOWNLOAD_DIR, os.path.basename(name))
            if not os.path.exists(path):
                raw = service.users().messages().attachments().get(userId="me", messageId=msg["id"], id=attachment).execute(num_retries=3)
                with open(path, "wb") as f:
                    f.write(base64.urlsafe_b64decode(raw["data"]))
            try:
                page1, last, description = read_pdf(path)
            except Exception as error:
                print(f"  could not read {name}: {error}")
                continue
            if "INVITATION TO BID" not in page1.upper():
                continue  # a COA or other paper, not an invitation
            info = parse_invitation_text(page1, last)
            omo = omo_from_filename(name) or info["omo"]
            if not omo or omo in awarded or not info["bidDue"]:
                continue
            if datetime.date.fromisoformat(info["bidDue"]) < today - datetime.timedelta(days=KEEP_PAST_DAYS):
                continue
            if omo in found and found[omo]["receivedAt"] >= received:
                continue  # keep the newest invitation for each OMO
            found[omo] = {**info, "omo": omo, "itbFile": os.path.basename(name), "description": description[:1500], "receivedAt": received, **bid_fields(path)}
    bids = []
    for omo, bid in sorted(found.items(), key=lambda kv: (kv[1]["bidDue"], kv[1]["bidDueTime"], kv[0])):
        old = known.get(omo, {})
        if old.get("lat") and old.get("address") == bid["address"]:
            bid["lat"], bid["lng"] = old["lat"], old["lng"]
        elif bid["address"]:
            bid["lat"], bid["lng"] = geocode(bid["address"], bid["borough"])
            time.sleep(0.3)
        os.makedirs(PUBLIC_ITB_DIR, exist_ok=True)
        shutil.copyfile(os.path.join(DOWNLOAD_DIR, bid["itbFile"]), os.path.join(PUBLIC_ITB_DIR, bid["itbFile"]))
        bids.append(bid)
    result = {"generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(), "days": days, "bids": bids}
    for out in OUT_FILES:
        os.makedirs(os.path.dirname(out), exist_ok=True)
        with open(out, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2)
    print(f"Upcoming bids: {len(bids)} not awarded yet ({sum(1 for b in bids if b.get('lat'))} on the map) from {len(messages)} emails")


if __name__ == "__main__":
    args = argparse.ArgumentParser()
    args.add_argument("--days", type=int, default=14)
    args.add_argument("--parse", help="read one invitation PDF and print what was found")
    opts = args.parse_args()
    if opts.parse:
        page1, last, description = read_pdf(opts.parse)
        print(json.dumps({**parse_invitation_text(page1, last), "description": description[:160], **bid_fields(opts.parse)}, indent=2))
    else:
        fetch(opts.days)
