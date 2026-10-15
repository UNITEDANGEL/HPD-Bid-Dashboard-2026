import json
import re
from pathlib import Path

import pdfplumber

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
from itb_text import FORM_PAGE, continuation  # noqa: E402  (long jobs continue on page 4+)

# Where HPD's notes start (contacts, affidavit fax): a continuation page adds only the work before them.
NOTES_START = re.compile(r"(?:NOTE\s*\d*\s*[-–:]?\s*)?(?:CONTRACTORS?\s+MUST\s+CONTACT|IF\s+(?:THE\s+)?LANDLORD\s+REFUSES|IF\s+NO\s+WORK\s+IS\s+PERFORMED)", re.I)


ROOT = Path.cwd()
DATA_FILE = ROOT / "public" / "data" / "COA_Fetcher_2026.json"
MANIFEST_FILE = ROOT / "public" / "data" / "itb_source_manifest.json"
OUTPUT_FILE = ROOT / "public" / "data" / "COA_Fetcher_2026.json"
SOURCE_PAGE = 3


def clean_document_file_name(raw):
    value = str(raw or "").strip()
    if not value:
        return ""
    file_name = re.split(r"[\\/]", value)[-1].strip()
    return file_name if file_name.lower().endswith(".pdf") else ""


def normalize_description(text):
    value = str(text or "")
    value = value.replace("\r", "\n").replace("\f", "\n")
    value = value.replace("\u2013", "-").replace("\u2014", "-")
    value = value.replace("\u201c", '"').replace("\u201d", '"')
    value = value.replace("\u2018", "'").replace("\u2019", "'")
    value = re.sub(r"[ \t]+", " ", value)
    value = re.sub(r"\n[ \t]+", "\n", value)
    value = re.sub(r"\n{3,}", "\n\n", value)
    return value.strip()


def extract_page_description(pdf_path, page_number):
    with pdfplumber.open(pdf_path) as pdf:
        if len(pdf.pages) < page_number:
            return ""
        text = pdf.pages[page_number - 1].extract_text(x_tolerance=1, y_tolerance=3) or ""
        # The description runs onto the next page(s) on long jobs (ER07755: items 8-10 on page 4).
        if not NOTES_START.search(text):
            for page in pdf.pages[page_number:]:
                more = page.extract_text(x_tolerance=1, y_tolerance=3) or ""
                if FORM_PAGE.search(more):
                    break
                extra = continuation(more)
                stop = NOTES_START.search(extra)
                if stop:
                    extra = extra[:stop.start()]
                if extra.strip():
                    text += chr(10) + extra
                if stop:
                    break

    match = re.search(r"Job\s+Description\s*:\s*", text, flags=re.IGNORECASE)
    if match:
        text = text[match.end() :]

    text = re.split(r"\n?General Decision Number:", text, maxsplit=1)[0]
    text = re.split(r"\n?Superseded General Decision Number:", text, maxsplit=1)[0]
    return normalize_description(text)


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


def main():
    jobs = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    manifest = json.loads(MANIFEST_FILE.read_text(encoding="utf-8"))
    entries = manifest.get("entries") or {}

    extracted_by_file = {}
    stats = {
        "jobs": len(jobs),
        "manifestEntries": len(entries),
        "descriptionsAdded": 0,
        "legacyDescriptionReplaced": 0,
        "missingManifestEntry": 0,
        "extractFailed": 0,
    }

    for job in jobs:
        file_name = clean_document_file_name(
            job.get("ITBFile")
            or job.get("itbFile")
            or job.get("ITB File")
            or job.get("PDFFile")
            or job.get("pdfFile")
        )
        entry = entries.get(file_name)
        if not entry:
            stats["missingManifestEntry"] += 1
            continue

        page_number = int(entry.get("page") or SOURCE_PAGE)

        source_file = entry.get("sourceFile") or ""
        source_path = Path(source_file)
        if not source_path.is_file():
            stats["missingManifestEntry"] += 1
            continue

        cache_key = f"{source_file}::p{page_number}"
        description = extracted_by_file.get(cache_key)
        if description is None:
            try:
                description = extract_page_description(source_path, page_number)
            except Exception:
                description = ""
            extracted_by_file[cache_key] = description

        if not description:
            stats["extractFailed"] += 1
            continue

        previous = current_description(job)
        job["ItbPage3Description"] = description
        job["ItbPage3DescriptionSource"] = f"PDF_PAGE_{page_number}"
        job["ItbPage3SourceFile"] = Path(source_file).name
        stats["descriptionsAdded"] += 1

        if re.search(r"confirmation of award|100 Gold Street, 8th floor You have been deemed", previous, flags=re.IGNORECASE):
            job["description"] = description
            job["JobDescription"] = description
            job["Job_Description"] = description
            job["DescriptionSource"] = "ITB_PAGE3_PDF_TEXT"
            job["descriptionSource"] = "ITB_PAGE3_PDF_TEXT"
            stats["legacyDescriptionReplaced"] += 1

    OUTPUT_FILE.write_text(json.dumps(jobs, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(stats, indent=2))


if __name__ == "__main__":
    main()
