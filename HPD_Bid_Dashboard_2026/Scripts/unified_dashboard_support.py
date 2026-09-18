from __future__ import annotations

import base64
import json
import math
import subprocess
import textwrap
from io import BytesIO
from dataclasses import dataclass
from datetime import date, datetime
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

import pandas as pd
from PIL import Image, ImageDraw, ImageFont
from pypdf import PdfReader, PdfWriter
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DASHBOARD_ROOT = PROJECT_ROOT / "HPD_Bid_Dashboard_2026"
RUNTIME_ROOT = Path.home() / "AppData" / "Local" / "Temp" / "HPD_Bid_Dashboard"
DASHBOARD_DATA_DIR = RUNTIME_ROOT / "Dashboard_Data"
RECORDS_DIR = DASHBOARD_DATA_DIR / "records"
GENERATED_OUTPUT_DIR = RUNTIME_ROOT / "Generated_Output"

MERGED_CSV = PROJECT_ROOT / "Samples" / "Merged Data" / "merged_job_data.csv"
NODE_DASHBOARD_DATA_DIR = DASHBOARD_ROOT / "Node_Dashboard" / "data"
FETCHER_JSON = NODE_DASHBOARD_DATA_DIR / "COA_Fetcher_2026.json"
FETCHER_CSV = NODE_DASHBOARD_DATA_DIR / "COA_Fetcher_2026.csv"
FETCHER_SCRIPT = PROJECT_ROOT / "NEW SCRIPTS" / "FetchAndMatch_Final.py"

COA_DIR = PROJECT_ROOT / "Confirmations_of_Award"
ITB_DIR = PROJECT_ROOT / "Invitations_to_Bid"

GENERATED_AFFIDAVITS_DIR = GENERATED_OUTPUT_DIR / "Affidavits"
GENERATED_INVOICES_DIR = GENERATED_OUTPUT_DIR / "Invoices"
JOB_CARDS_DIR = GENERATED_OUTPUT_DIR / "Job_Cards"

TEMPLATES_DIR = PROJECT_ROOT / "Templates"
FONT_PATH = TEMPLATES_DIR / "DejaVuSans-Bold.ttf"
AFFIDAVIT_EFFECTIVE_DATE = date(2026, 8, 28)


def first_existing_path(*candidates: Path) -> Path:
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return candidates[0]


WORK_COMPLETED_TEMPLATE_CURRENT = first_existing_path(
    TEMPLATES_DIR / "AFFIDAVIT OF WORK PERFORMED Updated Version 8-28-26.pdf",
    TEMPLATES_DIR / "Locked_AFFIDAVIT OF WORK PERFORMED 12.2024 Rev. 01.21.2025.pdf",
    TEMPLATES_DIR / "affidavit_work_completed.pdf",
)
WORK_COMPLETED_TEMPLATE_LEGACY = first_existing_path(
    TEMPLATES_DIR / "Locked_AFFIDAVIT OF WORK PERFORMED 12.2024 Rev. 01.21.2025.pdf",
    TEMPLATES_DIR / "affidavit_work_completed.pdf",
    TEMPLATES_DIR / "AFFIDAVIT OF WORK PERFORMED Updated Version 8-28-26.pdf",
)
NO_WORK_TEMPLATE_CURRENT = first_existing_path(
    TEMPLATES_DIR / "AFFIDAVIT OF NO WORK PERFORMED Updated Version 8-28-26.pdf",
    TEMPLATES_DIR / "Locked_AFFIDAVIT OF NO WORK PERFORMED 12.2024 Rev. 01.21.2025.pdf",
    TEMPLATES_DIR / "Locked_AFFIDAVIT OF NO WORK PERFORMED 12.2024 Rev. 01.21.2025 - Copy.pdf",
    TEMPLATES_DIR / "affidavit_no_work_completed.pdf",
)
NO_WORK_TEMPLATE_LEGACY = first_existing_path(
    TEMPLATES_DIR / "Locked_AFFIDAVIT OF NO WORK PERFORMED 12.2024 Rev. 01.21.2025.pdf",
    TEMPLATES_DIR / "Locked_AFFIDAVIT OF NO WORK PERFORMED 12.2024 Rev. 01.21.2025 - Copy.pdf",
    TEMPLATES_DIR / "affidavit_no_work_completed.pdf",
    TEMPLATES_DIR / "AFFIDAVIT OF NO WORK PERFORMED Updated Version 8-28-26.pdf",
)
WORK_COMPLETED_TEMPLATE = WORK_COMPLETED_TEMPLATE_CURRENT
NO_WORK_TEMPLATE = NO_WORK_TEMPLATE_CURRENT
INVOICE_TEMPLATE = first_existing_path(
    TEMPLATES_DIR / "INVOICE TEMPLATE.pdf",
    TEMPLATES_DIR / "INVOICE TEMPLATE WORD.pdf",
)

RECORDS_DIR.mkdir(parents=True, exist_ok=True)
GENERATED_AFFIDAVITS_DIR.mkdir(parents=True, exist_ok=True)
GENERATED_INVOICES_DIR.mkdir(parents=True, exist_ok=True)
JOB_CARDS_DIR.mkdir(parents=True, exist_ok=True)

COUNTY_BY_BOROUGH = {
    "BRONX": "BRONX",
    "BROOKLYN": "KINGS",
    "MANHATTAN": "NEW YORK",
    "NEW YORK": "NEW YORK",
    "QUEENS": "QUEENS",
    "STATEN ISLAND": "RICHMOND",
}

STATUS_OPTIONS = [
    "Pending",
    "Awarded",
    "Work In Progress",
    "Work Completed",
    "Partial Work Completed",
    "No Access - 1st Attempt",
    "No Access - 2nd Attempt",
    "Refused Access",
    "Work Completed by Other",
    "No Work Completed",
]

NO_WORK_REASONS = [
    "No Access (Requires 2 attempts)",
    "Refused Access",
    "Work Done by Others",
]

STATIC_VALUES = {
    "AffiantName": "JOTJAGRAJ SINGH/UNITED ANGEL CONSTRUCTION CORP",
    "ContractorName": "JOTJAGRAJ SINGH",
    "PrintName": "JOTJAGRAJ SINGH",
    "Signature": "Signature",
    "Title": "President",
    "TaxID": "",
}


PDF_RENDER_REFERENCE_DPI = 110


def rendered_coord(x_px: int, y_px: int) -> Tuple[int, int]:
    """Convert measured 110 DPI render coordinates to fill_pdf's 300 DPI coordinates."""
    return (round(x_px * 300 / PDF_RENDER_REFERENCE_DPI), round(y_px * 300 / PDF_RENDER_REFERENCE_DPI))


coords_work_legacy = {
    1: {
        "OMO_Header": (1100, 420),
        "County": (530, 675),
        "AffiantName": (80, 960),
        "BuildingAddress": (350, 1320),
        "AwardDate": (470, 1246),
        "Line2Date": (470, 1246),
        "OMO_Body": (400, 1590),
        "StartDate": (2078, 2245),
        "CompleteDate": (695, 2311),
        "PartialReason": (290, 2510),
        "PartialAmount1": (1629, 2574),
        "PartialAmount2": (362, 2911),
    },
    2: {
        "OMO": (1100, 190),
        "NameOfPerson": (1100, 475),
        "RelationshipToBuilding": (1100, 555),
        "DescriptionOfPerson": (1100, 690),
        "TypeOrPrintName": (1660, 1005),
        "PrintName": (1660, 1065),
    },
}

coords_no_work_legacy = {
    1: {
        "OMO_Header": (1080, 360),
        "County": (530, 675),
        "AffiantName": (65, 870),
        "BuildingAddress": (1064, 1251),
        "OMO_Body": (2159, 1180),
        "ServiceChargeAmount": (2174, 1450),
        "InaccessibilityReason1": (420, 1838),
        "InaccessibilityReason2": (420, 1908),
        "AttemptDate1": (2122, 2044),
        "AttemptDate2": (670, 2088),
        "ContractorName": (1734, 2620),
    },
    2: {
        "OMO_Number": (1330, 240),
        "WorksiteDate": (1133, 509),
        "DeniedPersonName": (1126, 772),
        "DeniedRelationship": (1126, 832),
        "DeniedDescription": (940, 972),
        "DeniedPhone": (1300, 1158),
        "PrintName": (1599, 1495),
    },
}

coords_work_current = {
    1: {
        "ContractorNameHeader": rendered_coord(222, 184),
        "OMO_Header": rendered_coord(602, 184),
        "County": rendered_coord(154, 281),
        "AffiantName": rendered_coord(30, 343),
        "BuildingAddress": rendered_coord(252, 503),
        "StartDate": rendered_coord(394, 924),
        "CompleteDate": rendered_coord(658, 924),
        "PartialAmount1": rendered_coord(458, 976),
        "PartialReason": rendered_coord(112, 1001),
        "PartialAmount2": rendered_coord(202, 1115),
    },
    2: {
        "OMO": rendered_coord(438, 88),
        "NameOfPerson": rendered_coord(366, 360),
        "RelationshipToBuilding": rendered_coord(268, 385),
        "DescriptionOfPerson": rendered_coord(174, 499),
        "TypeOrPrintName": rendered_coord(606, 919),
    },
}

coords_no_work_current = {
    1: {
        "ContractorNameHeader": rendered_coord(342, 153),
        "OMO_Header": rendered_coord(692, 153),
        "County": rendered_coord(194, 253),
        "AffiantName": rendered_coord(56, 324),
        "BuildingAddress": rendered_coord(321, 466),
        "ServiceChargeAmount": rendered_coord(458, 550),
        "InaccessibilityReason1": rendered_coord(153, 725),
        "InaccessibilityReason2": rendered_coord(153, 750),
        "AttemptDate1": rendered_coord(769, 794),
        "AttemptDate2": rendered_coord(205, 815),
        "OtherCompletedDate": rendered_coord(650, 858),
        "OtherInProgressDate": rendered_coord(665, 966),
        "OtherWorkerName": rendered_coord(606, 1010),
        "OtherWorkerRelationship": rendered_coord(480, 1029),
    },
    2: {
        "OMO_Number": rendered_coord(438, 103),
        "DeniedAccessDate": rendered_coord(665, 161),
        "DeniedPersonName": rendered_coord(596, 288),
        "DeniedRelationship": rendered_coord(436, 309),
        "DeniedPhone": rendered_coord(598, 352),
        "DeniedDescription": rendered_coord(174, 395),
        "PrintName": rendered_coord(552, 747),
    },
}

coords_work = coords_work_current
coords_no_work = coords_no_work_current

coords_invoice = {key: (x * 300 / 72, y * 300 / 72) for key, (x, y) in {
    "InvoiceNumber": (435, 104), "OMONumber": (96, 105),
    "BuildingAddress": (55, 191), "Borough": (98, 160),
    "TaxID": (435, 86), "DateIssued": (447, 143),
    "Trade": (87, 143), "FirstDate": (451, 160),
    "SecondDate": (451, 179), "GrandTotal": (488, 652),
    "PrintName": (112, 719), "Title": (432, 719),
    "Description1": (46, 264),
}.items()}


@dataclass
class GeneratedBundle:
    job_card_path: Optional[str] = None
    invoice_path: Optional[str] = None
    affidavit_path: Optional[str] = None
    affidavit_type: Optional[str] = None


def get_font(size: int = 40):
    try:
        return ImageFont.truetype(str(FONT_PATH), size)
    except OSError:
        return ImageFont.load_default()


if FONT_PATH.exists():
    try:
        pdfmetrics.registerFont(TTFont("DashboardFont", str(FONT_PATH)))
    except Exception:
        pass


def safe_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and math.isnan(value):
        return ""
    return str(value).strip()


def parse_money(value: Any) -> float:
    text = safe_text(value).replace("$", "").replace(",", "")
    try:
        return float(text)
    except ValueError:
        return 0.0


def format_money(value: Any) -> str:
    amount = parse_money(value)
    return f"${amount:,.2f}"


def normalize_date_string(value: Any) -> str:
    text = safe_text(value)
    if not text:
        return ""
    parsed = pd.to_datetime(text, errors="coerce")
    if pd.isna(parsed):
        return text
    return parsed.strftime("%m/%d/%Y")


def parse_source_date(value: Any) -> Optional[date]:
    text = safe_text(value)
    if not text:
        return None
    parsed = pd.to_datetime(text, errors="coerce")
    if pd.isna(parsed):
        return None
    return parsed.date()


def affidavit_template_version_for_row(row: Dict[str, Any]) -> str:
    award_date = parse_source_date(
        effective_value(row, "AwardDateDisplay", "AwardDate", "awardDate", "Award_Date", "AwardDate_dt")
    )
    if award_date and award_date < AFFIDAVIT_EFFECTIVE_DATE:
        return "legacy"
    return "current"


def affidavit_type_for_status(status: Any) -> str:
    normalized = safe_text(status).lower()
    if (
        "no access" in normalized
        or "refused" in normalized
        or "no work" in normalized
        or "completed by other" in normalized
        or "done by other" in normalized
    ):
        return "No Work Completed"
    return "Work Completed"


def no_work_reason_from_status(status: Any) -> str:
    normalized = safe_text(status).lower()
    if "no access" in normalized:
        return "No Access (Requires 2 attempts)"
    if "refused" in normalized:
        return "Refused Access"
    if "completed by other" in normalized or "done by other" in normalized:
        return "Work Done by Others"
    if "no work" in normalized:
        return "No Work Completed"
    return ""


def select_affidavit_template(row: Dict[str, Any], affidavit_type: str) -> Tuple[Path, Dict[str, Any], str]:
    version = affidavit_template_version_for_row(row)
    is_work = affidavit_type == "Work Completed"
    if is_work and version == "legacy":
        return WORK_COMPLETED_TEMPLATE_LEGACY, coords_work_legacy, version
    if is_work:
        return WORK_COMPLETED_TEMPLATE_CURRENT, coords_work_current, version
    if version == "legacy":
        return NO_WORK_TEMPLATE_LEGACY, coords_no_work_legacy, version
    return NO_WORK_TEMPLATE_CURRENT, coords_no_work_current, version


def make_row_id(row: Dict[str, Any]) -> str:
    parts = [
        safe_text(row.get("OMO")),
        safe_text(row.get("BuildingAddress")),
        safe_text(row.get("COA_File")),
        safe_text(row.get("ITB_File")),
    ]
    return "|".join(parts)


def record_file_for_omo(omo: str) -> Path:
    safe_omo = safe_text(omo) or "UNKNOWN"
    return RECORDS_DIR / f"{safe_omo}.json"


def load_record_state(omo: str) -> Dict[str, Any]:
    path = record_file_for_omo(omo)
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}


def save_record_state(omo: str, payload: Dict[str, Any]) -> Path:
    path = record_file_for_omo(omo)
    existing = load_record_state(omo)
    merged = {**existing, **payload}
    merged["updated_at"] = datetime.now().isoformat(timespec="seconds")
    path.write_text(json.dumps(merged, indent=2), encoding="utf-8")
    return path


def update_generated_paths(omo: str, bundle: GeneratedBundle) -> Path:
    existing = load_record_state(omo).get("generated_documents", {})
    merged_docs = dict(existing)
    if bundle.job_card_path:
        merged_docs["job_card_path"] = bundle.job_card_path
    if bundle.invoice_path:
        merged_docs["invoice_path"] = bundle.invoice_path
    if bundle.affidavit_path:
        merged_docs["affidavit_path"] = bundle.affidavit_path
    if bundle.affidavit_type:
        merged_docs["affidavit_type"] = bundle.affidavit_type
    payload = {
        "generated_documents": merged_docs
    }
    return save_record_state(omo, payload)


def build_document_candidates(kind: str, filename: str) -> List[str]:
    filename = safe_text(filename)
    if not filename:
        return []
    candidates = [filename]
    if kind == "itb" and filename.upper().endswith("_ITB.PDF"):
        candidates.append(filename[:-8] + ".pdf")
    if kind == "itb" and filename.lower().endswith(".pdf") and not filename.upper().endswith("_ITB.PDF"):
        candidates.append(filename[:-4] + "_ITB.pdf")
    return list(dict.fromkeys(candidates))


@lru_cache(maxsize=1)
def build_document_index() -> Dict[str, List[Path]]:
    directories = [
        COA_DIR,
        ITB_DIR,
        PROJECT_ROOT / "Downloads",
        PROJECT_ROOT / "Downloads" / "ITB",
        DASHBOARD_ROOT / "COA_PDFs",
        DASHBOARD_ROOT / "ITB_PDFs",
    ]
    index: Dict[str, List[Path]] = {}
    for directory in directories:
        if not directory.exists():
            continue
        for path in directory.rglob("*.pdf"):
            index.setdefault(path.name.lower(), [])
            if path not in index[path.name.lower()]:
                index[path.name.lower()].append(path)
    return index


def resolve_document_path(filename: str, kind: str) -> Optional[Path]:
    index = build_document_index()
    preferred_root = COA_DIR if kind == "coa" else ITB_DIR
    for candidate in build_document_candidates(kind, filename):
        matches = index.get(candidate.lower(), [])
        if not matches:
            continue
        for match in matches:
            if preferred_root in match.parents:
                return match
        return matches[0]
    return None


def resolve_record_documents(row: Dict[str, Any]) -> Dict[str, str]:
    coa_path = resolve_document_path(safe_text(row.get("COA_File")), "coa")
    itb_path = resolve_document_path(safe_text(row.get("ITB_File")), "itb")
    return {
        "coa_path": str(coa_path) if coa_path else "",
        "itb_path": str(itb_path) if itb_path else "",
    }


def list_filter_options(df: pd.DataFrame, column: str) -> List[str]:
    if column not in df.columns:
        return []
    values = sorted({safe_text(value) for value in df[column].tolist() if safe_text(value)})
    return values


def compute_service_charge(row: Dict[str, Any]) -> float:
    if safe_text(row.get("service_charge_override")):
        return parse_money(row.get("service_charge_override"))
    bid_amount = parse_money(row.get("BidAmount"))
    return 300.0 if bid_amount >= 2000 else 100.0


def derive_county(row: Dict[str, Any]) -> str:
    override = safe_text(row.get("county"))
    if override:
        return override.upper()
    borough = safe_text(row.get("Borough") or row.get("Boro")).upper()
    return COUNTY_BY_BOROUGH.get(borough, "QUEENS")


def effective_value(row: Dict[str, Any], *names: str) -> str:
    for name in names:
        value = safe_text(row.get(name))
        if value:
            return value
    return ""


def meaningful_field_value(row: Dict[str, Any], *names: str) -> str:
    text = effective_value(row, *names)
    if text.lower() in {"john doe", "tenant name", "not available", "n/a", "na", "none", "null", "unknown"}:
        return ""
    return text


def load_source_dataframe() -> pd.DataFrame:
    if FETCHER_JSON.exists():
        try:
            payload = json.loads(FETCHER_JSON.read_text(encoding="utf-8"))
            records = payload.get("jobs", payload.get("records", [])) if isinstance(payload, dict) else payload
            if isinstance(records, list) and records:
                return pd.DataFrame(records).fillna("")
        except Exception:
            pass

    if FETCHER_CSV.exists():
        try:
            return pd.read_csv(FETCHER_CSV).fillna("")
        except Exception:
            pass

    if MERGED_CSV.exists():
        return pd.read_csv(MERGED_CSV).fillna("")

    return pd.DataFrame()


def load_dashboard_dataframe() -> pd.DataFrame:
    df = load_source_dataframe()
    if df.empty:
        return df

    normalized_rows: List[Dict[str, Any]] = []
    for raw in df.to_dict(orient="records"):
        row = dict(raw)
        row["OMO"] = safe_text(row.get("OMO"))
        row["COA_File"] = effective_value(row, "COA_File", "COAFile", "coaFile")
        row["ITB_File"] = effective_value(row, "ITB_File", "ITBFile", "itbFile")
        row["Borough"] = effective_value(row, "Borough", "Boro", "borough", "boro")
        row["BuildingAddress"] = effective_value(row, "BuildingAddress", "address", "Address", "Location")
        row["Trade"] = effective_value(row, "Trade", "trade", "Trade_Summary")
        row["TenantName"] = effective_value(row, "TenantName", "tenantName", "Tenant")
        row["TenantPhone"] = effective_value(row, "TenantPhone", "tenantPhone", "Phone")
        row["JobDescription"] = effective_value(
            row,
            "JobDescription",
            "Job_Description",
            "DescriptionOfWork",
            "FullDescription",
            "Description",
            "description",
            "Summary",
        )
        row["Status"] = effective_value(row, "Status", "status", "workflowStatus", "statusOverride") or "Pending"
        row["AwardDateDisplay"] = normalize_date_string(
            effective_value(row, "AwardDate", "awardDate", "Award_Date", "AwardDate_dt")
        )
        row["WorkStartDate"] = normalize_date_string(
            effective_value(row, "WorkStartDate", "startDate", "Work_Start_Date", "Start_Date")
        )
        row["WorkCompletionDate"] = normalize_date_string(
            effective_value(row, "WorkCompletionDate", "completionDate", "CompletionDate", "Completion_Date")
        )
        row["BidAmount"] = effective_value(row, "BidAmount", "bidAmount", "AwardAmount", "Award_Amount", "AwardedAmount")
        row["row_id"] = make_row_id(row)

        doc_state = resolve_record_documents(row)
        row.update(doc_state)

        state = load_record_state(row["OMO"])
        row.update(state.get("fields", {}))
        row.update(state.get("generated_documents", {}))

        row["display_description"] = effective_value(
            row,
            "job_description_override",
            "JobDescription",
            "DescriptionOfWork",
            "FullDescription",
            "Description",
            "Summary",
        )
        row["display_bid_amount"] = effective_value(row, "bid_amount_override", "BidAmount")
        row["display_trade"] = effective_value(row, "trade_override", "Trade")
        row["display_status"] = effective_value(row, "status_override", "Status") or "Pending"
        row["display_location"] = effective_value(row, "location_override", "Location")
        row["display_notes"] = effective_value(row, "notes", "Notes")
        row["display_tenant_name"] = effective_value(row, "tenant_name_override", "TenantName")
        row["display_tenant_phone"] = effective_value(row, "tenant_phone_override", "TenantPhone")
        row["service_charge"] = compute_service_charge(row)
        normalized_rows.append(row)

    return pd.DataFrame(normalized_rows)


def save_record_fields(omo: str, fields: Dict[str, Any]) -> Path:
    return save_record_state(omo, {"fields": fields})


def run_fetcher() -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["python", str(FETCHER_SCRIPT)],
        cwd=str(PROJECT_ROOT),
        capture_output=True,
        text=True,
        timeout=600,
        check=False,
    )


def pdf_embed_html(pdf_path: str, height: int = 600) -> str:
    path = Path(pdf_path)
    if not path.exists():
        return "<p>PDF file not found.</p>"
    encoded = base64.b64encode(path.read_bytes()).decode("utf-8")
    return (
        f'<iframe src="data:application/pdf;base64,{encoded}" '
        f'width="100%" height="{height}" style="border:none;"></iframe>'
    )


def fill_pdf(template_path: Path, data: Dict[str, Any], output_path: Path, coords: Dict[str, Any]) -> Path:
    reader = PdfReader(str(template_path))
    writer = PdfWriter()
    writer.clone_document_from_reader(reader)
    font_name = "DashboardFont" if "DashboardFont" in pdfmetrics.getRegisteredFontNames() else "Helvetica"

    for page_number, page in enumerate(writer.pages, start=1):
        packet = BytesIO()
        page_width = float(page.mediabox.width)
        page_height = float(page.mediabox.height)
        pdf_canvas = canvas.Canvas(packet, pagesize=(page_width, page_height))
        pdf_canvas.setFont(font_name, 10)
        page_coords = coords.get(page_number, coords)
        for field, (x_px, y_px) in page_coords.items():
            value = safe_text(data.get(field))
            if not value:
                continue
            x_pt = x_px * 72.0 / 300.0
            y_pt = page_height - (y_px * 72.0 / 300.0)
            if template_path == INVOICE_TEMPLATE:
                available = (560 if field == "Description1" else 568 if x_pt > 400 else 292) - x_pt
                size = min(10, 10 * available / max(1, pdfmetrics.stringWidth(value, font_name, 10)))
                pdf_canvas.setFont(font_name, size)
            pdf_canvas.drawString(x_pt, y_pt, value)
        pdf_canvas.save()
        packet.seek(0)
        overlay_page = PdfReader(packet).pages[0]
        page.merge_page(overlay_page)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("wb") as handle:
        writer.write(handle)
    return output_path


def build_invoice_data(row: Dict[str, Any], timestamp: str) -> Dict[str, Any]:
    service_charge = compute_service_charge(row)
    return {
        **STATIC_VALUES,
        "InvoiceNumber": f"INV-{safe_text(row.get('OMO'))}-{timestamp}",
        "OMONumber": safe_text(row.get("OMO")),
        "BuildingAddress": safe_text(row.get("BuildingAddress")),
        "Borough": safe_text(row.get("Borough") or row.get("Boro")),
        "AptNumber": effective_value(row, "ApartmentUnit", "Apt", "AptNumber"),
        "TaxID": effective_value(row, "tax_id", "TaxID"),
        "DateIssued": datetime.now().strftime("%m/%d/%Y"),
        "ContractorName": STATIC_VALUES["ContractorName"],
        "Trade": effective_value(row, "trade_override", "Trade"),
        "Description1": effective_value(row, "job_description_override", "display_description"),
        "Amount1": f"${service_charge:,.2f}",
        "TotalCharge": f"${service_charge:,.2f}",
        "ServiceCharge": f"${service_charge:,.2f}",
        "GrandTotal": f"${service_charge:,.2f}",
        "FirstDate": normalize_date_string(effective_value(row, "work_start_date", "WorkStartDate")),
        "SecondDate": normalize_date_string(effective_value(row, "work_completion_date", "WorkCompletionDate")),
        "PrintName": STATIC_VALUES["PrintName"],
        "Title": STATIC_VALUES["Title"],
        "Signature": STATIC_VALUES["Signature"],
    }


def build_work_affidavit_data(row: Dict[str, Any]) -> Dict[str, Any]:
    completion_date = normalize_date_string(effective_value(row, "work_completion_date", "WorkCompletionDate"))
    partial_reason = safe_text(row.get("partial_reason"))
    has_partial_detail = bool(partial_reason)
    return {
        **STATIC_VALUES,
        "AffiantName": STATIC_VALUES["ContractorName"],
        "ContractorNameHeader": STATIC_VALUES["ContractorName"],
        "County": derive_county(row),
        "OMO_Header": safe_text(row.get("OMO")),
        "OMO_Body": safe_text(row.get("OMO")),
        "OMO": safe_text(row.get("OMO")),
        "BuildingAddress": safe_text(row.get("BuildingAddress")),
        "AwardDate": normalize_date_string(effective_value(row, "AwardDateDisplay", "AwardDate")),
        "Line2Date": normalize_date_string(effective_value(row, "AwardDateDisplay", "AwardDate")),
        "StartDate": normalize_date_string(effective_value(row, "work_start_date", "WorkStartDate")),
        "CompleteDate": completion_date,
        "PartialReason": partial_reason,
        "PartialAmount1": safe_text(row.get("partial_amount_1")),
        "PartialAmount2": safe_text(row.get("partial_amount_2")),
        "NameOfPerson": meaningful_field_value(row, "name_of_person") if has_partial_detail else "",
        "RelationshipToBuilding": meaningful_field_value(row, "relationship_to_building") if has_partial_detail else "",
        "DescriptionOfPerson": meaningful_field_value(row, "description_of_person") if has_partial_detail else "",
        "TypeOrPrintName": STATIC_VALUES["PrintName"],
        "PrintName": STATIC_VALUES["PrintName"],
        "NotaryDay": "",
        "NotaryMonth": "",
        "NotaryYear": "",
        "NotarySignature": "",
        "SwornDay": "",
        "SwornMonth": "",
        "SwornYear2": "",
        "Signature": "",
    }


def build_no_work_affidavit_data(row: Dict[str, Any]) -> Dict[str, Any]:
    reason = effective_value(row, "no_work_reason") or no_work_reason_from_status(
        effective_value(row, "Status", "statusOverride", "FieldOutcome", "StatusOverride")
    )
    reason_key = reason.lower()
    worksite_date = normalize_date_string(
        effective_value(row, "attempt2_date", "attempt1_date", "work_completion_date", "WorkCompletionDate")
    )
    is_no_access = "no access" in reason_key
    is_refused_access = "refused" in reason_key
    is_other_work = "other" in reason_key
    return {
        **STATIC_VALUES,
        "AffiantName": STATIC_VALUES["ContractorName"],
        "ContractorNameHeader": STATIC_VALUES["ContractorName"],
        "County": derive_county(row),
        "ServiceChargeAmount": f"{compute_service_charge(row):,.2f}",
        "OMO_Header": safe_text(row.get("OMO")),
        "OMO_Body": safe_text(row.get("OMO")),
        "OMO_Number": safe_text(row.get("OMO")),
        "BuildingAddress": safe_text(row.get("BuildingAddress")),
        "AttemptDate1": normalize_date_string(effective_value(row, "attempt1_date")) if is_no_access else "",
        "AttemptDate2": normalize_date_string(effective_value(row, "attempt2_date")) if is_no_access else "",
        "InaccessibilityReason1": reason if is_no_access else "",
        "InaccessibilityReason2": "",
        "OtherCompletedDate": worksite_date if is_other_work else "",
        "OtherInProgressDate": "",
        "OtherWorkerName": meaningful_field_value(row, "other_worker_name") if is_other_work else "",
        "OtherWorkerRelationship": meaningful_field_value(row, "other_worker_relationship") if is_other_work else "",
        "WorksiteDate": worksite_date,
        "DeniedAccessDate": worksite_date if is_refused_access else "",
        "DeniedPersonName": meaningful_field_value(row, "denied_person_name") if is_refused_access else "",
        "DeniedRelationship": meaningful_field_value(row, "denied_relationship") if is_refused_access else "",
        "DeniedDescription": meaningful_field_value(row, "denied_description") if is_refused_access else "",
        "DeniedPhone": meaningful_field_value(row, "denied_phone") if is_refused_access else "",
        "PrintName": STATIC_VALUES["PrintName"],
        "Signature": "",
        "SwornDay": "",
        "SwornMonth": "",
        "SwornYear2": "",
        "ContractorName": STATIC_VALUES["ContractorName"] if is_other_work else "",
    }


def generate_invoice_pdf(row: Dict[str, Any]) -> Path:
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    data = build_invoice_data(row, timestamp)
    output_path = GENERATED_INVOICES_DIR / f"{safe_text(row.get('OMO'))}_Invoice_{timestamp}.pdf"
    return fill_pdf(INVOICE_TEMPLATE, data, output_path, coords_invoice)


def generate_affidavit_pdf(row: Dict[str, Any], affidavit_type: str) -> Path:
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    selected_type = affidavit_type if affidavit_type in {"Work Completed", "No Work Completed"} else affidavit_type_for_status(
        effective_value(row, "Status", "statusOverride", "FieldOutcome", "StatusOverride")
    )
    template_path, coords, template_version = select_affidavit_template(row, selected_type)
    if selected_type == "Work Completed":
        output_path = GENERATED_AFFIDAVITS_DIR / f"{safe_text(row.get('OMO'))}_Work_Completed_{template_version}_{timestamp}.pdf"
        data = build_work_affidavit_data(row)
        return fill_pdf(template_path, data, output_path, coords)

    output_path = GENERATED_AFFIDAVITS_DIR / f"{safe_text(row.get('OMO'))}_No_Work_Completed_{template_version}_{timestamp}.pdf"
    data = build_no_work_affidavit_data(row)
    return fill_pdf(template_path, data, output_path, coords)


def wrap_paragraph(text: str, width: int = 78) -> List[str]:
    text = safe_text(text)
    if not text:
        return []
    lines: List[str] = []
    for paragraph in text.splitlines():
        paragraph = paragraph.strip()
        if not paragraph:
            lines.append("")
            continue
        lines.extend(textwrap.wrap(paragraph, width=width) or [""])
    return lines


def _draw_section(draw: ImageDraw.ImageDraw, top: int, title: str, lines: Iterable[str]) -> int:
    title_font = get_font(38)
    body_font = get_font(27)
    draw.text((120, top), title, fill="black", font=title_font)
    current_y = top + 52
    for line in lines:
        draw.text((140, current_y), line, fill="black", font=body_font)
        current_y += 34
    return current_y + 16


def generate_job_card_pdf(row: Dict[str, Any]) -> Path:
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_path = JOB_CARDS_DIR / f"{safe_text(row.get('OMO'))}_Job_Card_{timestamp}.pdf"

    page = Image.new("RGB", (2550, 3300), "white")
    draw = ImageDraw.Draw(page)
    title_font = get_font(60)
    body_font = get_font(30)

    draw.text((120, 90), "HPD Job Card", fill="black", font=title_font)
    draw.text(
        (120, 180),
        f"Generated {datetime.now().strftime('%m/%d/%Y %I:%M %p')}",
        fill="black",
        font=body_font,
    )

    details = [
        f"OMO: {safe_text(row.get('OMO'))}",
        f"Address: {safe_text(row.get('BuildingAddress'))}",
        f"Borough: {effective_value(row, 'Borough', 'Boro')}",
        f"Award Date: {effective_value(row, 'AwardDateDisplay', 'AwardDate')}",
        f"Bid Amount: {format_money(effective_value(row, 'display_bid_amount', 'BidAmount'))}",
        f"Status: {effective_value(row, 'display_status', 'Status')}",
        f"Trade: {effective_value(row, 'display_trade', 'Trade')}",
        f"Area Type: {safe_text(row.get('AreaType'))}",
        f"Tenant: {effective_value(row, 'display_tenant_name', 'TenantName')}",
        f"Phone: {effective_value(row, 'display_tenant_phone', 'TenantPhone')}",
        f"Location: {effective_value(row, 'display_location', 'Location')}",
        f"COA File: {safe_text(Path(safe_text(row.get('coa_path'))).name)}",
        f"ITB File: {safe_text(Path(safe_text(row.get('itb_path'))).name)}",
    ]

    y = 280
    for detail in details:
        draw.text((120, y), detail, fill="black", font=body_font)
        y += 44

    y += 20
    y = _draw_section(draw, y, "Job Description", wrap_paragraph(row.get("display_description"), width=82))
    y = _draw_section(draw, y, "Notes", wrap_paragraph(row.get("display_notes"), width=82) or ["No notes saved."])

    output_path.parent.mkdir(parents=True, exist_ok=True)
    page.save(str(output_path), "PDF", resolution=150.0)
    return output_path


def generate_document_bundle(row: Dict[str, Any], affidavit_type: str) -> GeneratedBundle:
    job_card_path = str(generate_job_card_pdf(row))
    invoice_path = str(generate_invoice_pdf(row))
    affidavit_path = str(generate_affidavit_pdf(row, affidavit_type))
    bundle = GeneratedBundle(
        job_card_path=job_card_path,
        invoice_path=invoice_path,
        affidavit_path=affidavit_path,
        affidavit_type=affidavit_type,
    )
    update_generated_paths(safe_text(row.get("OMO")), bundle)
    return bundle
