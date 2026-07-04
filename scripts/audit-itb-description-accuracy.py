import json
import re
from difflib import SequenceMatcher
from pathlib import Path

import pdfplumber


ROOT = Path.cwd()
DATA_FILE = ROOT / "public" / "data" / "COA_Fetcher_2026.json"
MANIFEST_FILE = ROOT / "public" / "data" / "itb_source_manifest.json"
SOURCE_PAGE = 3


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
    return normalize(text)


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


def main():
    jobs = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    manifest = json.loads(MANIFEST_FILE.read_text(encoding="utf-8"))
    entries = manifest.get("entries") or {}
    extracted_by_file = {}
    mismatches = []
    missing_source = []
    extract_failed = []
    matched = 0

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

        if source_file not in extracted_by_file:
            try:
                extracted_by_file[source_file] = extract_page3_description(source_path)
            except Exception as error:
                extracted_by_file[source_file] = ""
                extract_failed.append({"omo": omo, "itb": file_name, "error": str(error)})

        extracted = extracted_by_file[source_file]
        if not extracted:
            extract_failed.append({"omo": omo, "itb": file_name, "error": "empty extracted page 3 description"})
            continue

        current = current_description(job)
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
