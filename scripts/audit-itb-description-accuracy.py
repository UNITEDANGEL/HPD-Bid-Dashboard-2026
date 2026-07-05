import json
import re
import shutil
import subprocess
import tempfile
from difflib import SequenceMatcher
from pathlib import Path

import pdfplumber


ROOT = Path.cwd()
DATA_FILE = ROOT / "public" / "data" / "COA_Fetcher_2026.json"
MANIFEST_FILE = ROOT / "public" / "data" / "itb_source_manifest.json"
SOURCE_PAGE = 3
OCR_DPI = 220


def clean_document_file_name(raw):
    value = str(raw or "").strip()
    if not value:
        return ""
    file_name = re.split(r"[\\/]", value)[-1].strip()
    return file_name if file_name.lower().endswith(".pdf") else ""


def normalize(text):
    value = str(text or "")
    value = value.replace("\r", "\n").replace("\f", "\n")
    value = value.replace("\u2013", "-").replace("\u2014", "-")
    value = value.replace("\u201c", '"').replace("\u201d", '"')
    value = value.replace("\u2018", "'").replace("\u2019", "'")
    value = re.sub(r"[ \t]+", " ", value)
    value = re.sub(r"\n[ \t]+", "\n", value)
    value = re.sub(r"\n{3,}", "\n\n", value)
    return value.strip()


def compact(text):
    return re.sub(r"\s+", " ", normalize(text)).strip().lower()


def comparable(text):
    value = compact(text)
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def token_overlap(left, right):
    left_tokens = set(comparable(left).split())
    right_tokens = set(comparable(right).split())
    if not left_tokens or not right_tokens:
        return 0.0
    return len(left_tokens & right_tokens) / max(1, min(len(left_tokens), len(right_tokens)))


def similarity(left, right):
    return SequenceMatcher(None, comparable(left), comparable(right)).ratio()


def trim_page3_description(text):
    text = text or ""
    match = re.search(r"(?:Job\s+Descript(?:ion)?|WORK\s+DESCRIPTION)\s*:?\s*", text, flags=re.IGNORECASE)
    if match:
        text = text[match.end() :]

    text = re.split(r"\n?General Decision Number:", text, maxsplit=1)[0]
    text = re.split(r"\n?Superseded General Decision Number:", text, maxsplit=1)[0]
    return normalize(text)


def resolve_tool(tool_name):
    known_tools = {
        "pdftoppm": [
            r"C:\poppler\bin\pdftoppm.exe",
            r"C:\Program Files\poppler-24.08.0\Library\bin\pdftoppm.exe",
            r"C:\Users\uac52\.cache\codex-runtimes\codex-primary-runtime\dependencies\native\poppler\Library\bin\pdftoppm.exe",
        ],
        "tesseract": [
            r"C:\Program Files\Tesseract-OCR\tesseract.exe",
        ],
    }
    for candidate in known_tools.get(tool_name, []):
        if Path(candidate).is_file():
            return candidate

    path = shutil.which(tool_name)
    return path or ""


def ocr_page_description(pdf_path, page_number):
    pdftoppm = resolve_tool("pdftoppm")
    tesseract = resolve_tool("tesseract")
    if not pdftoppm or not tesseract:
        return "", ""

    with tempfile.TemporaryDirectory(prefix="itb-page3-ocr-") as temp_dir:
        output_prefix = Path(temp_dir) / "page"
        render = subprocess.run(
            [
                pdftoppm,
                "-f",
                str(page_number),
                "-l",
                str(page_number),
                "-r",
                str(OCR_DPI),
                "-png",
                str(pdf_path),
                str(output_prefix),
            ],
            capture_output=True,
            text=True,
            timeout=60,
            check=False,
        )
        if render.returncode != 0:
            return "", ""

        images = sorted(Path(temp_dir).glob("page*.png"))
        if not images:
            return "", ""

        result = subprocess.run(
            [tesseract, str(images[0]), "stdout", "--psm", "6"],
            capture_output=True,
            text=True,
            timeout=90,
            check=False,
        )
        if result.returncode != 0:
            return "", ""
        return result.stdout, trim_page3_description(result.stdout)


def text_has_omo(text, omo):
    haystack = re.sub(r"[^A-Z0-9]+", "", str(text or "").upper())
    needle = re.sub(r"[^A-Z0-9]+", "", str(omo or "").upper())
    if needle and needle in haystack:
        return True

    def ocr_normalize(value):
        return value.replace("O", "0").replace("I", "1").replace("L", "1")

    return bool(needle and ocr_normalize(needle) in ocr_normalize(haystack))


def is_real_job_description_page(raw_text, description):
    raw = str(raw_text or "")
    has_description_marker = re.search(r"Job\s+Descript(?:ion)?\s*:?", raw, flags=re.IGNORECASE)
    has_work_description_marker = re.search(r"WORK\s+DESCRIPTION", raw, flags=re.IGNORECASE)
    if not has_description_marker and not has_work_description_marker:
        return False

    cover_markers = (
        "INVITATION TO BID QUOTATION SHEET",
        "JOB DESCRIPTION ON OMO",
        "BID CERTIFICATION",
        "YOUR PRICE QUOTATION",
    )
    upper_raw = raw.upper()
    if any(marker in upper_raw for marker in cover_markers):
        return False

    words = comparable(description).split()
    return len(words) >= 8


def ocr_best_description(pdf_path, page_count, omo):
    is_fax_bundle = pdf_path.name.lower().startswith("faxcopy_")
    pages = [SOURCE_PAGE]
    if is_fax_bundle:
        # Fax bundles have a leading scanned page; the OMO description page is usually physical page 4.
        pages = [4, 3, 5, 6, 2, 7, 8]

    fallback = ("", "")
    for page_number in [page for page in pages if 1 <= page <= page_count]:
        raw_text, description = ocr_page_description(pdf_path, page_number)
        if not description or not is_real_job_description_page(raw_text, description):
            continue
        method = f"ocr_page_{page_number}"
        if text_has_omo(raw_text, omo):
            return description, method
        if is_fax_bundle:
            continue
        if not fallback[0] and re.search(r"Page\s*3\s*of\s*3", raw_text or "", flags=re.IGNORECASE):
            fallback = (description, method)

    return fallback


def extract_page3_description(pdf_path, omo):
    text = ""
    with pdfplumber.open(pdf_path) as pdf:
        page_count = len(pdf.pages)
        if len(pdf.pages) < SOURCE_PAGE:
            return "", "missing_page"
        text = pdf.pages[SOURCE_PAGE - 1].extract_text(x_tolerance=1, y_tolerance=3) or ""

    extracted = trim_page3_description(text)
    if extracted:
        return extracted, "pdf_text"

    ocr_text, method = ocr_best_description(pdf_path, page_count, omo)
    if ocr_text:
        return ocr_text, method

    return "", "empty"


def current_description(job):
    for key in (
        "ItbPage3Description",
        "itbPage3Description",
        "description",
        "JobDescription",
        "Job_Description",
        "Description",
        "WorkDescription",
        "ScopeOfWork",
        "Job Description",
    ):
        value = job.get(key)
        if value:
            return str(value)
    return ""


def source_label(job):
    return str(job.get("ItbPage3DescriptionSource") or job.get("DescriptionSource") or job.get("descriptionSource") or "")


def visual_source_page_description(pdf_path, page_number, current):
    raw_text, description = ocr_page_description(pdf_path, page_number)
    if not raw_text and not description:
        return "", ""

    if token_overlap(current, raw_text) >= 0.68 or token_overlap(current, description) >= 0.68:
        return description or raw_text, f"ocr_manifest_page_{page_number}"

    return "", ""


def main():
    jobs = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    manifest = json.loads(MANIFEST_FILE.read_text(encoding="utf-8"))
    entries = manifest.get("entries") or {}
    extracted_by_file = {}
    mismatches = []
    missing_source = []
    extract_failed = []
    matched = 0
    ocr_used = 0

    for job in jobs:
        omo = str(job.get("OMO") or job.get("omo") or "").strip()
        if not re.match(r"^[A-Z]{2}\d+", omo):
            continue

        file_name = clean_document_file_name(job.get("ITBFile") or job.get("itbFile") or job.get("ITB File"))
        entry = entries.get(file_name)
        if not entry:
            missing_source.append({"omo": omo, "itb": file_name, "reason": "missing manifest entry"})
            continue

        source_file = entry.get("sourceFile") or ""
        source_path = Path(source_file)
        if not source_path.is_file():
            missing_source.append({"omo": omo, "itb": file_name, "reason": "source PDF missing"})
            continue

        current = current_description(job)
        cache_key = f"{source_file}::{omo}"
        if cache_key not in extracted_by_file:
            try:
                extracted_by_file[cache_key] = extract_page3_description(source_path, omo)
            except Exception as error:
                extracted_by_file[cache_key] = ("", "error")
                extract_failed.append({"omo": omo, "itb": file_name, "error": str(error)})

        extracted, method = extracted_by_file[cache_key]
        if not extracted:
            manifest_page = int(entry.get("page") or SOURCE_PAGE)
            manifest_cache_key = f"{source_file}::manifest::{manifest_page}::{omo}"
            if manifest_cache_key not in extracted_by_file:
                try:
                    extracted_by_file[manifest_cache_key] = visual_source_page_description(source_path, manifest_page, current)
                except Exception:
                    extracted_by_file[manifest_cache_key] = ("", "error")
            extracted, method = extracted_by_file[manifest_cache_key]

        if method.startswith("ocr"):
            ocr_used += 1
        if not extracted:
            extract_failed.append({"omo": omo, "itb": file_name, "error": "empty extracted page 3 description"})
            continue

        current_compact = comparable(current)
        extracted_compact = comparable(extracted)
        if current_compact == extracted_compact:
            matched += 1
            continue

        contains = current_compact in extracted_compact or extracted_compact in current_compact
        ratio = similarity(current, extracted)
        overlap = token_overlap(current, extracted)
        if not contains and ratio < 0.84 and overlap < 0.72:
            mismatches.append(
                {
                    "omo": omo,
                    "address": job.get("BuildingAddress") or job.get("Address") or "",
                    "itb": file_name,
                    "source": source_label(job),
                    "sourceMatch": entry.get("sourceMatch") or "",
                    "similarity": round(ratio, 3),
                    "tokenOverlap": round(overlap, 3),
                    "currentPreview": re.sub(r"\s+", " ", current).strip()[:220],
                    "page3Preview": re.sub(r"\s+", " ", extracted).strip()[:220],
                }
            )
        else:
            matched += 1

    print(
        json.dumps(
            {
                "jobs": len([j for j in jobs if re.match(r"^[A-Z]{2}\d+", str(j.get("OMO") or ""))]),
                "matchedOrContained": matched,
                "mismatches": len(mismatches),
                "missingSource": len(missing_source),
                "extractFailed": len(extract_failed),
                "ocrUsed": ocr_used,
                "mismatchSample": mismatches[:50],
                "missingSourceSample": missing_source[:50],
                "extractFailedSample": extract_failed[:20],
            },
            indent=2,
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
