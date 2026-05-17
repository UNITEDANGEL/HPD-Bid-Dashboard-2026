"""
FETCHR MATCHER V5 – STEP 1 + STEP 2

Step 1 (COA):
- Fetch latest CONFIRMATION OF AWARD emails (100d or 5d).
- Download COA PDFs and extract:
    * OMO
    * BuildingAddress
    * Location
    * WorkStartDate
    * WorkCompletionDate
    * AwardDate
    * AwardAmount
    * AwardedBy
- Unit and TotalSqFt are NOT used (always blank).
- Geocode BuildingAddress (if Google API key present).
- If multiple COAs for same OMO → keep latest by timestamp in filename.

Step 2 (ITB):
- For each OMO from COA:
    * Fetch Invitation to Bid for that OMO (latest).
    * ITB Page 2:
        - TenantName
        - TenantPhone
        - ApartmentUnit
        - Location (fallback if COA location missing)
    * ITB Page 3:
        - Full JobDescription page (entire page text, no cleaning).
- If Location indicates hallway/public area → TenantName = "John Doe", no phone/unit.
- If no tenant + no unit → TenantName = "John Doe".
- Merge COA + ITB into monthly CSV + JSON:
    "November Merge Data 2025.<ext>" etc.
"""

import os
import re
import csv
import json
import argparse
import datetime
from dataclasses import dataclass
from typing import Optional, Dict, List, Tuple, Any

import requests
from tqdm import tqdm
from PyPDF2 import PdfReader

from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request


# ------------------------- CLI / MODE -------------------------

parser = argparse.ArgumentParser(description="Fetchr Matcher V5")
parser.add_argument("--initial", action="store_true", help="Run initial 100-day pull")
parser.add_argument("--update", action="store_true", help="Run 5-day incremental update")
parser.add_argument("--debug", action="store_true", help="Enable verbose logging")
args, _ = parser.parse_known_args()

LOOKBACK_DAYS = 75 if args.initial else 95
DEBUG = bool(args.debug)

print(f"\n=== FETCHR MATCHER V5 START (Last {LOOKBACK_DAYS} Days) ===\n")

# ------------------------- PATHS / CONFIG -------------------------

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]

CREDENTIALS_FILE = os.path.join(BASE_DIR, "credentials.json")
TOKEN_FILE = os.path.join(BASE_DIR, "token.json")

OUT_DIR = os.path.join(BASE_DIR, "mereged_data_csv_2025")
os.makedirs(OUT_DIR, exist_ok=True)

COA_DOWNLOAD_DIR = os.path.join(BASE_DIR, "COA_Downloads_V5")
ITB_DOWNLOAD_DIR = os.path.join(BASE_DIR, "ITB_Downloads_V5")
os.makedirs(COA_DOWNLOAD_DIR, exist_ok=True)
os.makedirs(ITB_DOWNLOAD_DIR, exist_ok=True)

GOOGLE_API_KEY_FILE = os.path.join(BASE_DIR, "google_api_key.txt")


def get_export_paths() -> Tuple[str, str]:
    year = datetime.datetime.now().strftime("%Y")
    base = f"COA_Fetcher_{year}"
    return (
        os.path.join(OUT_DIR, f"{base}.csv"),
        os.path.join(OUT_DIR, f"{base}.json"),
    )



def load_google_api_key() -> Optional[str]:
    key = os.getenv("GOOGLE_API_KEY")
    if key:
        return key.strip()
    if os.path.exists(GOOGLE_API_KEY_FILE):
        try:
            txt = open(GOOGLE_API_KEY_FILE, "r", encoding="utf-8").read().strip()
            if txt:
                return txt
        except Exception as e:
            print(f"Warning: error reading google_api_key.txt: {e}")
    return None


GOOGLE_GEOCODE_API_KEY = load_google_api_key()
if not GOOGLE_GEOCODE_API_KEY:
    print("⚠️  WARNING: No Google API key found. Geocoding will return NO_KEY.")
else:
    print("✅ Google API key loaded for geocoding.")


# ------------------------- UTILS -------------------------

def dlog(msg: str):
    if DEBUG:
        print(msg)


def clean_spaces(s: str) -> str:
    s = (s or "").replace("\r", "\n")
    s = re.sub(r"[ \t]+", " ", s)
    s = "\n".join([ln.strip() for ln in s.splitlines()])
    return s.strip()


def clean_singleline(s: str) -> str:
    s = clean_spaces(s)
    s = re.sub(r"\s*\n\s*", " ", s)
    return s.strip()


def pick_best_address(raw: str) -> str:
    s = clean_singleline(raw)
    # Remove contamination from your own company address if present
    s = re.sub(r'120-17 91 AVENUE', '', s, flags=re.IGNORECASE)

    if "Bldg Address:" in s:
        parts = s.split("Bldg Address:")
        tail = parts[-1].strip()
        return tail.strip(" ,")
    if "Building Address:" in s:
        parts = s.split("Building Address:")
        tail = parts[-1].strip()
        return tail.strip(" ,")

    m = re.findall(r"[^\n,]+(?:, *\w+)?(?:, *\w+)?(?:, *\d{5})", s)
    if m:
        return m[-1].strip()
    return s


def extract_omo(text: str) -> str:
    if not text:
        return ""
    m = re.search(r"E[A-Z](\d{5})", text, re.IGNORECASE)
    return f"{m.group(0).upper()}" if m else ""


def extract_timestamp_from_filename(fn: str) -> str:
    """
    From 'EQ10797_102725122849.pdf' → '102725122849'
    Used only for picking the latest file.
    """
    base = os.path.basename(fn)
    m = re.search(r"_(\d{10,14})", base)
    if m:
        return m.group(1)
    m2 = re.search(r"_(\d+)", base)
    return m2.group(1) if m2 else ""


def infer_award_date_from_filename(path_or_name: str) -> str:
    """
    Fallback AwardDate from COA filename timestamp.
    Example: EQ12968_121025031335.pdf -> 12/10/25
    """
    ts = extract_timestamp_from_filename(path_or_name)
    if len(ts) >= 6:
        mm = ts[0:2]
        dd = ts[2:4]
        yy = ts[4:6]
        return f"{mm}/{dd}/{yy}"
    return ""
# ------------------------- GMAIL AUTH -------------------------

def get_gmail_service():
    creds = None
    if os.path.exists(TOKEN_FILE):
        try:
            from google.oauth2.credentials import Credentials
            creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)
        except Exception:
            creds = None

    if not creds or not creds.valid:
        try:
            if creds and creds.expired and creds.refresh_token:
                creds.refresh(Request())
            else:
                flow = InstalledAppFlow.from_client_secrets_file(
                    CREDENTIALS_FILE, SCOPES
                )
                creds = flow.run_local_server(port=0)
        except Exception as e:
            print(f"AUTH ERROR: {e}")
            raise SystemExit(1)

        with open(TOKEN_FILE, "w", encoding="utf-8") as f:
            f.write(creds.to_json())

    try:
        service = build("gmail", "v1", credentials=creds, cache_discovery=False)
    except HttpError as e:
        print(f"GMAIL BUILD ERROR: {e}")
        raise SystemExit(1)
    return service


# ------------------------- COA PARSING -------------------------

@dataclass
class COAItem:
    omo: str
    coa_file: str
    building_address: str
    location: str
    apartment_unit: str
    work_start: str
    work_end: str
    award_date: str
    award_amount: str
    awarded_by: str
    total_sq_ft: str
    geo_status: str
    lat: Optional[float]
    lng: Optional[float]
    parse_status: str
    debug: Dict[str, str]


def extract_pdf_text(path: str) -> List[str]:
    pages: List[str] = []
    try:
        reader = PdfReader(path)
        for p in reader.pages:
            pages.append(p.extract_text() or "")
    except Exception as e:
        return [f"PDF_ERROR: {e}"]
    return pages


def extract_award_amount_no_dollar(text: str) -> str:
    """
    Awarded Amount line sometimes looks like:
    'Awarded Amount: (212) 863 - 7805 490.00'
    We want the LAST numeric chunk → 490.00
    """
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    for ln in lines:
        lower = ln.lower()
        if "award" in lower and "amount" in lower:
            nums = re.findall(r"[0-9]+(?:\.[0-9]+)?", ln)
            if nums:
                return nums[-1].strip()
    return ""


def extract_awarded_by(text: str) -> str:
    """
    Extract 'Awarded By' name, e.g.
    'Awarded By : Date : 10/28/25DHANYA RAJAN'
    or name on the line after Awarded Amount.
    """
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]

    for ln in lines:
        lower = ln.lower()
        if "awarded by" in lower:
            m_dates = re.findall(r"\d{1,2}/\d{1,2}/\d{2,4}", ln)
            tail = ln
            if m_dates:
                last_date = m_dates[-1]
                idx = ln.rfind(last_date)
                if idx != -1:
                    tail = ln[idx + len(last_date):]
            else:
                tail = re.sub(r"(?i)awarded\s*by\s*[:\-]?", "", ln)
            name = tail.strip(" :-")
            if name:
                return clean_singleline(name)

    for i, ln in enumerate(lines):
        if "award" in ln.lower() and "amount" in ln.lower():
            if i + 1 < len(lines):
                nxt = lines[i + 1].strip()
                if re.search(r"[A-Za-z]{3,}", nxt) and "award" not in nxt.lower():
                    return clean_singleline(nxt)
    return ""


def extract_dates(text: str) -> Tuple[str, str, str]:
    """
    Extract Work Start Date, Work Completion Date, Award Date.
    """
    ws = ""
    we = ""
    ad = ""

    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    date_re = re.compile(r"(\d{1,2}/\d{1,2}/\d{2,4})")

    for ln in lines:
        lower = ln.lower()
        dates = date_re.findall(ln)

        if not ws and "work start" in lower:
            if dates:
                ws = dates[0]

        if not we and ("work completion" in lower or "completion date" in lower):
            if dates:
                we = dates[-1]

        if not ad and ("award date" in lower or ("awarded by" in lower and "date" in lower)):
            if dates:
                ad = dates[-1]

    return ws, we, ad


def extract_address_location_unit(text: str) -> Tuple[str, str, str]:
    """
    COA address + location.
    Apartment/Unit is NOT used for COA → always blank.
    """
    addr = ""
    loc = ""

    m_bldg = re.search(r"Bldg\s*Address\s*[:\-]?\s*(.+)", text, re.IGNORECASE)
    if m_bldg:
        addr = m_bldg.group(1).strip()
    else:
        m_addr = re.search(r"Address\s*[:\-]?\s*(.+)", text, re.IGNORECASE)
        if m_addr:
            addr = m_addr.group(1).strip()

    addr = pick_best_address(addr)

    m_loc = re.search(r"Location\s*[:\-]?\s*(.+)", text, re.IGNORECASE)
    if m_loc:
        loc = clean_singleline(m_loc.group(1))

    return addr, loc, ""  # Unit always blank


def extract_total_sqft(text: str) -> str:
    return ""  # Not used


def parse_coa_pdf(path: str, omo: str) -> COAItem:
    dbg: Dict[str, str] = {"file": os.path.basename(path)}
    dlog(f"[COA] Parsing {os.path.basename(path)} (OMO {omo})")

    pages = extract_pdf_text(path)
    if pages and pages[0].startswith("PDF_ERROR"):
        return COAItem(
            omo=omo,
            coa_file=os.path.basename(path),
            building_address="",
            location="",
            apartment_unit="",
            work_start="",
            work_end="",
            award_date="",
            award_amount="",
            awarded_by="",
            total_sq_ft="",
            geo_status="PDF_ERROR",
            lat=None,
            lng=None,
            parse_status="FAILED",
            debug=dbg,
        )

    text = "\n".join(pages)

    ws, we, ad = extract_dates(text)
    # Fallback AwardDate if PDF did not contain it
    if not ad:
        ad = infer_award_date_from_filename(path)
    aa = extract_award_amount_no_dollar(text)
    ab = extract_awarded_by(text)
    addr, loc, unit = extract_address_location_unit(text)
    sqft = extract_total_sqft(text)

    junk_tokens = ["OMO No.", "Form 1123", "REP:", "OBJ:"]
    if any(tok in ab for tok in junk_tokens):
        ab = ""

    if DEBUG:
        print(
            f"[COA] OMO {omo} | "
            f"Address: {addr} | "
            f"Location: {loc} | "
            f"Work Start Date: {ws} | "
            f"Work Completion Date: {we} | "
            f"Award Date: {ad} | "
            f"Award Amount: {aa} | "
            f"Awarded By: {ab}"
        )

    return COAItem(
        omo=omo,
        coa_file=os.path.basename(path),
        building_address=addr,
        location=loc,
        apartment_unit=unit,
        work_start=ws,
        work_end=we,
        award_date=ad,
        award_amount=aa,
        awarded_by=ab,
        total_sq_ft=sqft,
        geo_status="",
        lat=None,
        lng=None,
        parse_status="OK",
        debug=dbg,
    )


# ------------------------- ITB PARSING (STEP 2) -------------------------

@dataclass
class ITBItem:
    omo: str
    itb_file: str
    job_description: str
    tenant_name: str
    tenant_phone: str
    apartment_unit: str
    location: str
    match_status: str
    missing_reason: str
    debug: Dict[str, str]


def parse_itb_pdf(path: str, omo: str) -> ITBItem:
    dbg: Dict[str, str] = {"file": os.path.basename(path)}
    dlog(f"[ITB] Parsing {os.path.basename(path)} for OMO {omo}")

    tenant_name = ""
    tenant_phone = ""
    apartment_unit = ""
    itb_location = ""
    job_desc = ""

    try:
        reader = PdfReader(path)
        num_pages = len(reader.pages)

        # ---- PAGE 2: Tenant / Apt / Location ----
        if num_pages >= 2:
            page2 = reader.pages[1].extract_text() or ""
            page2_clean = clean_spaces(page2)

            # Apt / Unit
            m_unit = re.search(r"Apt\s*[:\s]+([A-Za-z0-9\-]+)", page2_clean, re.IGNORECASE)
            if m_unit:
                apartment_unit = m_unit.group(1).strip()

            # Location (ITB)
            m_loc = re.search(r"Location\s*[:\s]+(.+)", page2_clean, re.IGNORECASE)
            if m_loc:
                itb_location = clean_singleline(m_loc.group(1))

            # Tenant Name
            m_name = re.search(r"Tenant\s*Name\s*[:\s]+(.+)", page2_clean, re.IGNORECASE)
            if m_name:
                tenant_name = clean_singleline(m_name.group(1))

            # Tenant Phone (not hotline)
            m_phone = re.search(r"(\(?\d{3}\)?[-\s]?\d{3}[-\s]?\d{4})", page2_clean)
            if m_phone:
                phone = m_phone.group(1)
                digits = re.sub(r"\D", "", phone)
                if digits != "2128636046":
                    tenant_phone = phone

        # ---- PAGE 3: FULL Job Description page ----
        if num_pages >= 3:
            job_desc = reader.pages[2].extract_text() or ""
        elif num_pages > 0:
            job_desc = reader.pages[-1].extract_text() or ""
        else:
            job_desc = ""

    except Exception as e:
        dbg["error"] = f"PDF_ERROR: {e}"

    if DEBUG:
        print(
            f"[ITB] OMO {omo} | Apt: {apartment_unit} | "
            f"Location: {itb_location} | Tenant: {tenant_name} | "
            f"Phone: {tenant_phone} | JobDesc chars: {len(job_desc)}"
        )

    return ITBItem(
        omo=omo,
        itb_file=os.path.basename(path),
        job_description=job_desc,
        tenant_name=tenant_name,
        tenant_phone=tenant_phone,
        apartment_unit=apartment_unit,
        location=itb_location,
        match_status="MATCHED" if omo else "NO_OMO",
        missing_reason="" if omo else "OMO not found in ITB PDF name",
        debug=dbg,
    )


# ------------------------- GEOCODING -------------------------

def geocode_address(addr: str) -> Tuple[str, Optional[float], Optional[float]]:
    addr = (addr or "").strip()
    if not addr:
        return "NO_ADDRESS", None, None
    if not GOOGLE_GEOCODE_API_KEY:
        return "NO_KEY", None, None
    try:
        resp = requests.get(
            "https://maps.googleapis.com/maps/api/geocode/json",
            params={"address": addr, "key": GOOGLE_GEOCODE_API_KEY},
            timeout=10,
        )
        if resp.status_code != 200:
            return f"HTTP_{resp.status_code}", None, None
        data = resp.json()
        status = data.get("status", "")
        if status != "OK":
            return status, None, None
        loc = data["results"][0]["geometry"]["location"]
        return "OK", float(loc["lat"]), float(loc["lng"])
    except Exception as e:
        return f"ERROR:{e.__class__.__name__}", None, None


def apply_geocoding(coa_items: List[COAItem]) -> None:
    for idx, c in enumerate(
        tqdm(coa_items, total=len(coa_items), desc="Geocoding COA addresses"),
        start=1
    ):
        status, lat, lng = geocode_address(c.building_address)
        c.geo_status = status
        c.lat = lat
        c.lng = lng
        dlog(f"[GEOCODE] {idx}/{len(coa_items)} OMO {c.omo} → {status} {lat},{lng}")


# ------------------------- TENANT LOGIC (JOHN DOE) -------------------------

def apply_tenant_logic(location: str, tenant_name: str, tenant_phone: str, apartment_unit: str):
    """
    - If location indicates hallway / public → John Doe, no phone/unit.
    - If no apartment AND no tenant → John Doe.
    """
    loc_lower = (location or "").lower()
    hallway_keywords = [
        "hallway",
        "public area",
        "public hallway",
        "corridor",
        "stairs",
        "interior public",
        "public corridor"
    ]

    if any(k in loc_lower for k in hallway_keywords):
        return "John Doe", "", ""

    if not apartment_unit.strip() and not tenant_name.strip():
        return "John Doe", "", ""

    return tenant_name, tenant_phone, apartment_unit


# ------------------------- MERGE STRUCT -------------------------

@dataclass
class JobRow:
    omo: str
    coa_file: str
    itb_file: str
    building_address: str
    location: str
    apartment_unit: str
    tenant_name: str
    tenant_phone: str
    work_start_date: str
    work_completion_date: str
    award_date: str
    award_amount: str
    awarded_by: str
    total_sq_ft: str
    job_description: str
    geocode: str
    latitude: Optional[float]
    longitude: Optional[float]
    missing_itb_reason: str
    coa_parse_status: str
    itb_match_status: str
    debug_info: Dict[str, Any]


# ------------------------- GMAIL FETCH COA -------------------------

def gmail_fetch_coa_messages(service, days: int) -> List[Dict]:
    # Build a date range that includes ALL of today, then goes backwards `days`
    today = datetime.datetime.now().date()
    start_date = today - datetime.timedelta(days=days)
    end_date = today + datetime.timedelta(days=1)  # Gmail `before:` is exclusive

    start = start_date.strftime("%Y/%m/%d")
    tomorrow = end_date.strftime("%Y/%m/%d")

    query = (
        f'from:OMOBid@hpd.nyc.gov '
        f'subject:"CONFIRMATION OF AWARD" '
        f'has:attachment filename:pdf '
        f'after:{start} before:{tomorrow}'
    )
    print(f"GMAIL COA QUERY: {query}")

    msgs: List[Dict] = []
    token = None
    while True:
        resp = (
            service.users()
            .messages()
            .list(userId="me", q=query, maxResults=100, pageToken=token)
            .execute()
        )
        msgs.extend(resp.get("messages", []))
        token = resp.get("nextPageToken")
        if not token:
            break

    full_msgs: List[Dict] = []
    for i, m in enumerate(tqdm(msgs, desc="Downloading COA messages"), start=1):
        try:
            full = (
                service.users()
                .messages()
                .get(userId="me", id=m["id"], format="full")
                .execute()
            )
            full_msgs.append(full)
            if DEBUG:
                subj = ""
                for h in full.get("payload", {}).get("headers", []):
                    if h["name"].lower() == "subject":
                        subj = h["value"]
                        break
                print(f"[COA] Msg {i}/{len(msgs)} Subject: {subj}")
        except HttpError as e:
            print(f"COA message read error: {e}")

    return full_msgs

def download_coa_attachments(service, msg: Dict) -> List[str]:
    from base64 import urlsafe_b64decode

    paths: List[str] = []
    payload = msg.get("payload", {})
    parts = payload.get("parts", [])
    msg_id = msg.get("id")

    for p in parts:
        fn = p.get("filename", "")
        if not fn.lower().endswith(".pdf"):
            continue
        body = p.get("body", {})
        att_id = body.get("attachmentId")
        if not att_id:
            continue

        try:
            att = (
                service.users()
                .messages()
                .attachments()
                .get(userId="me", messageId=msg_id, id=att_id)
                .execute()
            )
        except HttpError as e:
            print(f"COA attachment download error: {e}")
            continue

        data = att.get("data")
        if not data:
            continue

        file_bytes = urlsafe_b64decode(data.encode("utf-8"))
        safe_name = fn.replace("/", "_").replace("\\", "_")
        out_path = os.path.join(COA_DOWNLOAD_DIR, safe_name)
        try:
            with open(out_path, "wb") as f:
                f.write(file_bytes)
            paths.append(out_path)
            dlog(f"[COA] Downloaded attachment: {out_path}")
        except Exception as e:
            print(f"COA file write error ({out_path}): {e}")

    return paths


def build_coa_items_from_gmail(service, days: int) -> List[COAItem]:
    msgs = gmail_fetch_coa_messages(service, days)
    raw_items: List[COAItem] = []

    for msg in msgs:
        subject = ""
        for h in msg.get("payload", {}).get("headers", []):
            if h["name"].lower() == "subject":
                subject = h["value"]
                break

        omo = extract_omo(subject)
        pdf_paths = download_coa_attachments(service, msg)

        for p in pdf_paths:
            file_omo = extract_omo(os.path.basename(p))
            this_omo = omo or file_omo
            if not this_omo:
                print(f"Skipping COA (no OMO found): {p}")
                continue
            raw_items.append(parse_coa_pdf(p, this_omo))

    # Deduplicate by OMO: keep latest timestamp
    best_by_omo: Dict[str, COAItem] = {}
    for item in raw_items:
        ts = extract_timestamp_from_filename(item.coa_file)
        existing = best_by_omo.get(item.omo)
        if not existing:
            best_by_omo[item.omo] = item
        else:
            ts_existing = extract_timestamp_from_filename(existing.coa_file)
            if ts > ts_existing:
                best_by_omo[item.omo] = item

    items = list(best_by_omo.values())
    print(f"COA items parsed (latest per OMO): {len(items)}")

    apply_geocoding(items)
    return items


# ------------------------- GMAIL FETCH ITB -------------------------

def download_itb_attachments(service, msg: Dict) -> List[Tuple[str, str]]:
    from base64 import urlsafe_b64decode

    paths: List[Tuple[str, str]] = []
    payload = msg.get("payload", {})
    parts = payload.get("parts", [])
    msg_id = msg.get("id")

    for p in parts:
        fn = p.get("filename", "")
        if not fn.lower().endswith(".pdf"):
            continue
        body = p.get("body", {})
        att_id = body.get("attachmentId")
        if not att_id:
            continue

        try:
            att = (
                service.users()
                .messages()
                .attachments()
                .get(userId="me", messageId=msg_id, id=att_id)
                .execute()
            )
        except HttpError as e:
            print(f"ITB attachment download error: {e}")
            continue

        data = att.get("data")
        if not data:
            continue

        file_bytes = urlsafe_b64decode(data.encode("utf-8"))
        safe_name = fn.replace("/", "_").replace("\\", "_")
        out_path = os.path.join(ITB_DOWNLOAD_DIR, safe_name)
        try:
            with open(out_path, "wb") as f:
                f.write(file_bytes)
            paths.append((out_path, fn))
            dlog(f"[ITB] Downloaded attachment: {out_path}")
        except Exception as e:
            print(f"ITB file write error ({out_path}): {e}")

    return paths


def build_itb_lookup_from_gmail_for_omos(
    service, days: int, omo_list: List[str]
) -> Dict[str, ITBItem]:
    lookup: Dict[str, ITBItem] = {}
    omo_list = sorted(set([o for o in omo_list if o]))

    if not omo_list:
        print("No OMOs from COA — skipping ITB lookup.")
        return lookup

    for idx, omo in enumerate(
        tqdm(omo_list, desc="Fetching ITBs for COA OMOs"), start=1
    ):
        today = datetime.datetime.now().strftime("%Y/%m/%d")
        start = (datetime.datetime.now() - datetime.timedelta(days=days)).strftime("%Y/%m/%d")
        tomorrow = (datetime.datetime.now() + datetime.timedelta(days=days)).strftime("%Y/%m/%d")
        today = datetime.datetime.now().strftime("%Y/%m/%d")
        start = (datetime.datetime.now() - datetime.timedelta(days=days)).strftime("%Y/%m/%d")
        tomorrow = (datetime.datetime.now() + datetime.timedelta(days=days)).strftime("%Y/%m/%d")
        query = (
            f'"Invitation to Bid" {omo} '
            f'has:attachment filename:pdf '
            f'after:{start} before:{tomorrow}'
        )
        dlog(f"[ITB] Searching: {query}")
        try:
            resp = (
                service.users()
                .messages()
                .list(userId="me", q=query, maxResults=5)
                .execute()
            )
        except HttpError as e:
            print(f"ITB search error for {omo}: {e}")
            continue

        msgs = resp.get("messages", [])
        if not msgs:
            dlog(f"[ITB] No ITB found for {omo}")
            continue

        # We'll only inspect first few messages, attachments inside them
        best_item_for_omo: Optional[ITBItem] = None
        best_ts_for_omo: str = ""

        for m in msgs:
            try:
                full = (
                    service.users()
                    .messages()
                    .get(userId="me", id=m["id"], format="full")
                    .execute()
                )
            except HttpError as e:
                print(f"ITB read error for {omo}: {e}")
                continue

            att_list = download_itb_attachments(service, full)
            for path, original_name in att_list:
                item = parse_itb_pdf(path, omo)
                ts = extract_timestamp_from_filename(original_name)
                if not best_item_for_omo or ts > best_ts_for_omo:
                    best_item_for_omo = item
                    best_ts_for_omo = ts

        if best_item_for_omo:
            existing = lookup.get(omo)
            if existing:
                ts_existing = extract_timestamp_from_filename(existing.itb_file)
                if best_ts_for_omo > ts_existing:
                    lookup[omo] = best_item_for_omo
            else:
                lookup[omo] = best_item_for_omo

    print(f"ITB items parsed (latest per OMO): {len(lookup)}")
    return lookup


# ------------------------- MERGE COA + ITB -------------------------

def merge_coa_itb(
    coa_items: List[COAItem], itb_lookup: Dict[str, ITBItem]
) -> List[JobRow]:
    rows: List[JobRow] = []

    for c in coa_items:
        itb = itb_lookup.get(c.omo)

        if itb:
            # Prefer COA location, fallback to ITB location
            final_location = c.location or itb.location

            # Apply tenant logic (John Doe for hallways/public)
            final_tenant_name, final_tenant_phone, final_apartment_unit = apply_tenant_logic(
                final_location,
                itb.tenant_name,
                itb.tenant_phone,
                itb.apartment_unit,
            )

            itb_file = itb.itb_file
            job_desc = itb.job_description
            itb_status = itb.match_status
            missing = itb.missing_reason
            itb_dbg = itb.debug

        else:
            final_location = c.location
            final_tenant_name, final_tenant_phone, final_apartment_unit = apply_tenant_logic(
                final_location, "", "", ""
            )

            itb_file = ""
            job_desc = ""
            itb_status = "NO_ITB"
            missing = "No ITB found for this OMO"
            itb_dbg = {}

        debug: Dict[str, Any] = {}
        debug.update({f"COA_{k}": str(v) for k, v in c.debug.items()})
        debug.update({f"ITB_{k}": str(v) for k, v in itb_dbg.items()})

        rows.append(
            JobRow(
                omo=c.omo,
                coa_file=c.coa_file,
                itb_file=itb_file,
                building_address=c.building_address,
                location=final_location,
                apartment_unit=final_apartment_unit,
                tenant_name=final_tenant_name,
                tenant_phone=final_tenant_phone,
                work_start_date=c.work_start,
                work_completion_date=c.work_end,
                award_date=c.award_date,
                award_amount=c.award_amount,
                awarded_by=c.awarded_by,
                total_sq_ft=c.total_sq_ft,
                job_description=job_desc,
                geocode=c.geo_status,
                latitude=c.lat,
                longitude=c.lng,
                missing_itb_reason=missing,
                coa_parse_status=c.parse_status,
                itb_match_status=itb_status,
                debug_info=debug,
            )
        )

    return rows


# ------------------------- EXPORT -------------------------

def export_results(job_rows: List[JobRow]) -> None:
    # One master yearly CSV/JSON
    csv_path, json_path = get_export_paths()

    fieldnames = [
        "OMO",
        "COAFile",
        "ITBFile",
        "BuildingAddress",
        "Location",
        "ApartmentUnit",
        "TenantName",
        "TenantPhone",
        "WorkStartDate",
        "WorkCompletionDate",
        "AwardDate",
        "AwardAmount",
        "AwardedBy",
        "TotalSqFt",
        "JobDescription",
        "Geocode",
        "Latitude",
        "Longitude",
        "MissingITBReason",
        "COAParseStatus",
        "ITBMatchStatus",
        "DebugInfo",
    ]

    # ----------------- MERGE & DEDUPE FOR CSV -----------------
    # Key = OMO (if missing, create a synthetic key so row isn't lost)
    combined_csv_rows: Dict[str, Dict[str, str]] = {}

    # 1) Load existing CSV rows, if file already exists
    if os.path.exists(csv_path):
        try:
            with open(csv_path, "r", newline="", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                for i, row in enumerate(reader):
                    key = row.get("OMO") or f"NOOMO_EXISTING_{i}"
                    combined_csv_rows[key] = row
        except Exception as e:
            print(f"Warning: could not read existing CSV ({csv_path}): {e}")

    # 2) Convert new job_rows into dicts and overwrite/append
    for idx, r in enumerate(job_rows):
        row_dict = {
            "OMO": r.omo,
            "COAFile": r.coa_file,
            "ITBFile": r.itb_file,
            "BuildingAddress": r.building_address,
            "Location": r.location,
            "ApartmentUnit": r.apartment_unit,
            "TenantName": r.tenant_name,
            "TenantPhone": r.tenant_phone,
            "WorkStartDate": r.work_start_date,
            "WorkCompletionDate": r.work_completion_date,
            "AwardDate": r.award_date,
            "AwardAmount": r.award_amount,
            "AwardedBy": r.awarded_by,
            "TotalSqFt": r.total_sq_ft,
            "JobDescription": r.job_description,
            "Geocode": r.geocode,
            "Latitude": "" if r.latitude is None else str(r.latitude),
            "Longitude": "" if r.longitude is None else str(r.longitude),
            "MissingITBReason": r.missing_itb_reason,
            "COAParseStatus": r.coa_parse_status,
            "ITBMatchStatus": r.itb_match_status,
            "DebugInfo": json.dumps(r.debug_info, ensure_ascii=False),
        }
        key = row_dict["OMO"] or f"NOOMO_NEW_{idx}"
        # New run overwrites old row for same OMO
        combined_csv_rows[key] = row_dict

    # 3) Write merged + deduped CSV back
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames, quoting=csv.QUOTE_ALL)
        w.writeheader()
        for row in combined_csv_rows.values():
            w.writerow(row)

    # ----------------- MERGE & DEDUPE FOR JSON -----------------
    combined_json_rows: Dict[str, Dict[str, Any]] = {}

    # 1) Load existing JSON rows if file exists
    if os.path.exists(json_path):
        try:
            with open(json_path, "r", encoding="utf-8") as f:
                existing_json = json.load(f)
                if isinstance(existing_json, list):
                    for i, obj in enumerate(existing_json):
                        key = obj.get("OMO") or f"NOOMO_EXISTING_{i}"
                        combined_json_rows[key] = obj
        except Exception as e:
            print(f"Warning: could not read existing JSON ({json_path}): {e}")

    # 2) Add new job_rows, overwriting on same OMO
    for idx, r in enumerate(job_rows):
        obj = {
            "OMO": r.omo,
            "COAFile": r.coa_file,
            "ITBFile": r.itb_file,
            "BuildingAddress": r.building_address,
            "Location": r.location,
            "ApartmentUnit": r.apartment_unit,
            "TenantName": r.tenant_name,
            "TenantPhone": r.tenant_phone,
            "WorkStartDate": r.work_start_date,
            "WorkCompletionDate": r.work_completion_date,
            "AwardDate": r.award_date,
            "AwardAmount": r.award_amount,
            "AwardedBy": r.awarded_by,
            "TotalSqFt": r.total_sq_ft,
            "JobDescription": r.job_description,
            "Geocode": r.geocode,
            "Latitude": r.latitude,
            "Longitude": r.longitude,
            "MissingITBReason": r.missing_itb_reason,
            "COAParseStatus": r.coa_parse_status,
            "ITBMatchStatus": r.itb_match_status,
            "DebugInfo": r.debug_info,
        }
        key = obj["OMO"] or f"NOOMO_NEW_{idx}"
        combined_json_rows[key] = obj

    # 3) Write merged + deduped JSON back
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(list(combined_json_rows.values()), f, ensure_ascii=False, indent=2)

    print(f"\nCSV saved -> {csv_path}")
    print(f"JSON saved -> {json_path}")


# ------------------------- MAIN -------------------------

def run():
    print("=== FETCHR MATCHER V5 PIPELINE ===")
    svc = get_gmail_service()

    # 1) COA
    coa_items = build_coa_items_from_gmail(svc, LOOKBACK_DAYS)

    # 2) ITB – only OMOs from COA, latest per OMO
    omo_list = [c.omo for c in coa_items if c.omo]
    itb_lookup = build_itb_lookup_from_gmail_for_omos(svc, LOOKBACK_DAYS, omo_list)

    # 3) Merge
    job_rows = merge_coa_itb(coa_items, itb_lookup)
    print(f"Final JobRows: {len(job_rows)}")

    # 4) Export
    export_results(job_rows)

    print("\n=== FETCHR MATCHER V5 DONE ===")


if __name__ == "__main__":
    run()
def infer_award_date_from_filename(path_or_name: str) -> str:
    """
    Fallback AwardDate from COA filename timestamp.
    Example: EQ12968_121025031335.pdf -> 12/10/25
    """
    ts = extract_timestamp_from_filename(path_or_name)
    if len(ts) >= 6:
        mm = ts[0:2]
        dd = ts[2:4]
        yy = ts[4:6]
        return f"{mm}/{dd}/{yy}"
    return ""
