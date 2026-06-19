import json
import os
import re
import subprocess
import tempfile
from pathlib import Path
from PyPDF2 import PdfReader

JSON_PATH = Path("data/COA_Fetcher_2026.json")
BACKUP_PATH = Path("data/COA_Fetcher_2026.before_coa_description_recovery.json")
COA_ROOT = Path(r"G:\My Drive\HPD_Bid_Management_Project\Scripts\Diagnostics script\COA_Downloads_V5")

BACKUP_PATH.write_text(JSON_PATH.read_text(encoding="utf-8"), encoding="utf-8")
jobs = json.loads(JSON_PATH.read_text(encoding="utf-8"))

GENERIC_MARKERS = [
    "is described on the attached copy of the omo",
    "job description on omo",
    "no bids will be accepted",
    "emergency operations division",
    "you must certify your bid price",
    "bids will be deemed non-responsive",
]

def get(job, *keys):
    for key in keys:
        value = job.get(key)
        if value is not None and str(value).strip():
            return str(value).strip()
    return ""

def is_generic(desc):
    text = str(desc or "").lower()
    return any(marker in text for marker in GENERIC_MARKERS)

def find_pdf(file_name):
    if not file_name:
        return None

    direct = COA_ROOT / file_name
    if direct.exists():
        return direct

    alt = COA_ROOT / file_name.replace(".pdf", " (1).pdf")
    if alt.exists():
        return alt

    matches = list(COA_ROOT.rglob(file_name))
    if matches:
        return matches[0]

    return None

def clean_text(text):
    text = text.replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()

def read_pdf_text(pdf_path):
    try:
        reader = PdfReader(str(pdf_path))
        text = ""
        for page in reader.pages:
            text += page.extract_text() or ""
        return clean_text(text)
    except Exception:
        return ""

def ocr_pdf(pdf_path):
    with tempfile.TemporaryDirectory() as tmp:
        prefix = str(Path(tmp) / "page")

        subprocess.run(
            ["pdftoppm", "-r", "220", "-png", "-f", "1", "-l", "2", str(pdf_path), prefix],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

        parts = []
        for image in sorted(Path(tmp).glob("*.png")):
            result = subprocess.run(
                ["tesseract", str(image), "stdout", "-l", "eng", "--psm", "6"],
                check=False,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                text=True,
                encoding="utf-8",
                errors="ignore",
            )
            parts.append(result.stdout or "")

        return clean_text("\n".join(parts))

def extract_description(text, omo, address):
    text = clean_text(text)
    if not text:
        return ""

    upper = text.upper()

    starts = [
        "JOB DESCRIPTION:",
        "JOB DESCRIPTION",
        "DESCRIPTION OF WORK:",
        "DESCRIPTION OF WORK",
        "WORK DESCRIPTION:",
        "WORK DESCRIPTION",
        "SCOPE OF WORK:",
        "SCOPE OF WORK",
        "DESCRIPTION:",
    ]

    start_pos = -1
    start_marker = ""

    for marker in starts:
        idx = upper.find(marker)
        if idx >= 0 and (start_pos == -1 or idx < start_pos):
            start_pos = idx
            start_marker = marker

    if start_pos >= 0:
        desc = text[start_pos + len(start_marker):].strip()
    else:
        # fallback: look for the OMO/address area and take useful text after it
        desc = text

    stop_markers = [
        "NO BIDS WILL BE ACCEPTED",
        "BIDS WILL BE DEEMED",
        "EMERGENCY OPERATIONS DIVISION",
        "CONTRACTOR MUST CONTACT",
        "IF NO WORK IS PERFORMED",
        "AFFIDAVIT COPY",
        "VENDOR MUST",
        "SIGNATURE",
        "TOTAL AMOUNT",
    ]

    desc_upper = desc.upper()
    stop_pos = -1

    for marker in stop_markers:
        idx = desc_upper.find(marker)
        if idx > 80 and (stop_pos == -1 or idx < stop_pos):
            stop_pos = idx

    if stop_pos > 0:
        desc = desc[:stop_pos].strip()

    desc = clean_text(desc)

    # reject known boilerplate
    if is_generic(desc):
        return ""

    if len(desc) < 25:
        return ""

    return desc[:7000]

targets = []
for job in jobs:
    desc = get(job, "JobDescription", "description", "Job_Description")
    if not desc or is_generic(desc):
        coa = get(job, "COAFile", "coaFile")
        if coa:
            targets.append(job)

print("Generic/blank descriptions needing COA extraction:", len(targets))

patched = 0
missing_pdf = 0
failed = 0
samples = []

for job in targets:
    omo = get(job, "OMO", "id")
    address = get(job, "BuildingAddress", "address")
    coa_file = get(job, "COAFile", "coaFile")
    pdf = find_pdf(coa_file)

    if not pdf:
        missing_pdf += 1
        continue

    text = read_pdf_text(pdf)

    if not text or len(text) < 50:
        try:
            text = ocr_pdf(pdf)
        except Exception:
            text = ""

    desc = extract_description(text, omo, address)

    if not desc:
        failed += 1
        job["DescriptionNeedsCOAReview"] = True
        job["descriptionNeedsCOAReview"] = True
        continue

    job["JobDescription"] = desc
    job["description"] = desc
    job["Job_Description"] = desc
    job["DescriptionSource"] = "COA_PDF"
    job["descriptionSource"] = "COA_PDF"
    job["DescriptionNeedsCOAReview"] = False
    job["descriptionNeedsCOAReview"] = False

    patched += 1

    if len(samples) < 10:
        samples.append({
            "OMO": omo,
            "Address": address,
            "Preview": desc[:180].replace("\n", " ")
        })

JSON_PATH.write_text(json.dumps(jobs, indent=2), encoding="utf-8")

print("COA descriptions patched:", patched)
print("Missing COA PDF:", missing_pdf)
print("Failed/review needed:", failed)
print("Backup:", BACKUP_PATH)

print("\nSamples:")
for sample in samples:
    print(sample)
