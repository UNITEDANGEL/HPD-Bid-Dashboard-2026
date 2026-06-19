import json
import os
import re
import subprocess
import tempfile
from pathlib import Path

JSON_PATH = Path("data/COA_Fetcher_2026.json")
BACKUP_PATH = Path("data/COA_Fetcher_2026.before_ocr_description_recovery.json")
ITB_ROOT = Path(r"G:\My Drive\HPD_Bid_Management_Project\Scripts\Diagnostics script\ITB_Downloads_V5")

BACKUP_PATH.write_text(JSON_PATH.read_text(encoding="utf-8"), encoding="utf-8")

jobs = json.loads(JSON_PATH.read_text(encoding="utf-8"))

def get(job, *keys):
    for key in keys:
        value = job.get(key)
        if value is not None and str(value).strip():
            return str(value).strip()
    return ""

def find_pdf(file_name):
    if not file_name:
        return None

    direct = ITB_ROOT / file_name
    if direct.exists():
        return direct

    alt = ITB_ROOT / file_name.replace(".pdf", " (1).pdf")
    if alt.exists():
        return alt

    # fallback recursive search
    matches = list(ITB_ROOT.rglob(file_name))
    if matches:
        return matches[0]

    return None

def clean_text(text):
    text = text.replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()

def extract_description(text):
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
        # fax copies may OCR without labels; keep a useful chunk
        desc = text.strip()

    stop_markers = [
        "CONTRACTOR MUST CONTACT",
        "IF NO WORK IS PERFORMED",
        "IF LANDLORD REFUSES",
        "AFFIDAVIT COPY MUST BE FAXED",
        "HPD EMERGENCY REPAIR PROGRAM",
        "VENDOR MUST",
        "NOTE:",
    ]

    desc_upper = desc.upper()
    stop_pos = -1

    for marker in stop_markers:
        idx = desc_upper.find(marker)
        if idx > 100 and (stop_pos == -1 or idx < stop_pos):
            stop_pos = idx

    if stop_pos > 0:
        desc = desc[:stop_pos].strip()

    # remove obvious fax/header junk at top
    desc = re.sub(r"(?i)^.*?JOB DESCRIPTION[:\s]*", "", desc, count=1).strip()
    desc = clean_text(desc)

    if len(desc) < 25:
        return ""

    return desc[:7000]

def ocr_pdf(pdf_path):
    with tempfile.TemporaryDirectory() as tmp:
        prefix = str(Path(tmp) / "page")

        subprocess.run(
            ["pdftoppm", "-r", "220", "-png", "-f", "1", "-l", "2", str(pdf_path), prefix],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

        text_parts = []
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
            text_parts.append(result.stdout or "")

        return "\n".join(text_parts)

targets = [
    job for job in jobs
    if not get(job, "JobDescription", "description", "Job_Description")
    and get(job, "ITBFile", "itbFile")
]

print("Targets needing OCR:", len(targets))

patched = 0
missing_pdf = 0
failed = 0
samples = []

for job in targets:
    omo = get(job, "OMO", "id")
    address = get(job, "BuildingAddress", "address")
    itb_file = get(job, "ITBFile", "itbFile")

    pdf = find_pdf(itb_file)
    if not pdf:
        missing_pdf += 1
        continue

    try:
        text = ocr_pdf(pdf)
        desc = extract_description(text)

        if not desc:
            failed += 1
            continue

        job["JobDescription"] = desc
        job["description"] = desc
        job["Job_Description"] = desc
        job["DescriptionSource"] = "OCR_ITB"
        job["descriptionSource"] = "OCR_ITB"

        patched += 1

        if len(samples) < 10:
            samples.append({
                "OMO": omo,
                "Address": address,
                "DescriptionPreview": desc[:160].replace("\n", " ")
            })

    except Exception:
        failed += 1

JSON_PATH.write_text(json.dumps(jobs, indent=2), encoding="utf-8")

print("OCR descriptions patched:", patched)
print("Missing PDF:", missing_pdf)
print("Failed OCR/extract:", failed)
print("Backup:", BACKUP_PATH)

print("\nSamples:")
for sample in samples:
    print(sample)
