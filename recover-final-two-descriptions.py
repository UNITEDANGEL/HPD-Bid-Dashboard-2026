import json
import re
import subprocess
import tempfile
from pathlib import Path

JSON_PATH = Path("data/COA_Fetcher_2026.json")
BACKUP_PATH = Path("data/COA_Fetcher_2026.before_final_two_description_recovery.json")
ITB_ROOT = Path(r"G:\My Drive\HPD_Bid_Management_Project\Scripts\Diagnostics script\ITB_Downloads_V5")

BACKUP_PATH.write_text(JSON_PATH.read_text(encoding="utf-8"), encoding="utf-8")
jobs = json.loads(JSON_PATH.read_text(encoding="utf-8"))

TARGET_OMOS = {"EQ15728", "EQ23165"}

def get(job, *keys):
    for key in keys:
        value = job.get(key)
        if value is not None and str(value).strip():
            return str(value).strip()
    return ""

def find_pdf(file_name):
    direct = ITB_ROOT / file_name
    if direct.exists():
        return direct
    matches = list(ITB_ROOT.rglob(file_name))
    return matches[0] if matches else None

def clean(text):
    text = text.replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r" +\n", "\n", text)
    return text.strip()

def ocr_pages_1_6(pdf):
    pages = []
    with tempfile.TemporaryDirectory() as tmp:
        prefix = str(Path(tmp) / "page")
        subprocess.run(
            ["pdftoppm", "-r", "250", "-png", "-f", "1", "-l", "6", str(pdf), prefix],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

        for img in sorted(Path(tmp).glob("*.png")):
            best = ""
            for psm in ["4", "6"]:
                result = subprocess.run(
                    ["tesseract", str(img), "stdout", "-l", "eng", "--psm", psm],
                    stdout=subprocess.PIPE,
                    stderr=subprocess.DEVNULL,
                    text=True,
                    encoding="utf-8",
                    errors="ignore",
                )
                text = clean(result.stdout or "")
                if len(text) > len(best):
                    best = text
            pages.append(best)
    return pages

def extract_desc(pages):
    candidates = []

    for page in pages:
        upper = page.upper()
        if "JOB DESCRIPTION" not in upper:
            continue
        if "INVITATION TO BID QUOTATION SHEET" in upper:
            continue

        start = upper.find("JOB DESCRIPTION")
        desc = re.sub(r"(?is)^.*?JOB DESCRIPTION\s*:?", "", page[start:]).strip()

        stops = [
            "CONTRACTOR MUST CONTACT",
            "IF NO WORK IS PERFORMED",
            "IF LANDLORD REFUSES",
            "AFFIDAVIT COPY",
            "WORK DESCRIPTION FORM",
            "PERMIT REQUIRED",
            "FORM NO.",
        ]

        du = desc.upper()
        stop = -1
        for marker in stops:
            pos = du.find(marker)
            if pos > 80 and (stop == -1 or pos < stop):
                stop = pos

        if stop > 0:
            desc = desc[:stop].strip()

        desc = clean(desc)

        if len(desc) >= 30 and "NO BIDS WILL BE ACCEPTED" not in desc.upper():
            candidates.append(desc)

    if not candidates:
        return ""

    candidates.sort(key=len, reverse=True)
    return candidates[0][:7000]

patched = 0
failed = 0

for job in jobs:
    omo = get(job, "OMO", "id")
    if omo not in TARGET_OMOS:
        continue

    itb = get(job, "ITBFile", "itbFile")
    pdf = find_pdf(itb)

    if not pdf:
        failed += 1
        continue

    pages = ocr_pages_1_6(pdf)
    desc = extract_desc(pages)

    if not desc:
        failed += 1
        continue

    job["JobDescription"] = desc
    job["description"] = desc
    job["Job_Description"] = desc
    job["DescriptionSource"] = "ITB_OCR_PAGES_1_6"
    job["descriptionSource"] = "ITB_OCR_PAGES_1_6"
    patched += 1

    print("PATCHED", omo, desc[:250].replace("\n", " "))

JSON_PATH.write_text(json.dumps(jobs, indent=2), encoding="utf-8")

print("Patched:", patched)
print("Failed:", failed)
print("Backup:", BACKUP_PATH)
