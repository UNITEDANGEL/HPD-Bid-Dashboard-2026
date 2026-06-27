import json
import re
from pathlib import Path

import pdfplumber


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


def extract_page3_description(pdf_path):
    with pdfplumber.open(pdf_path) as pdf:
        if len(pdf.pages) < SOURCE_PAGE:
            return ""
        text = pdf.pages[SOURCE_PAGE - 1].extract_text(x_tolerance=1, y_tolerance=3) or ""

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
        "confirmedPage3Entries": len(entries),
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

        if int(entry.get("page") or 0) != SOURCE_PAGE:
            stats["missingManifestEntry"] += 1
            continue

        source_file = entry.get("sourceFile") or ""
        source_path = Path(source_file)
        if not source_path.is_file():
            stats["missingManifestEntry"] += 1
            continue

        description = extracted_by_file.get(source_file)
        if description is None:
            try:
                description = extract_page3_description(source_path)
            except Exception:
                description = ""
            extracted_by_file[source_file] = description

        if not description:
            stats["extractFailed"] += 1
            continue

        previous = current_description(job)
        job["ItbPage3Description"] = description
        job["ItbPage3DescriptionSource"] = "PDF_PAGE_3"
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
