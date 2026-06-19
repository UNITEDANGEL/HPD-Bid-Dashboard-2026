import json
import re
import subprocess
import tempfile
from pathlib import Path
from PyPDF2 import PdfReader

JSON_PATH = Path("data/COA_Fetcher_2026.json")
BACKUP_PATH = Path("data/COA_Fetcher_2026.before_fast_itb_page34_recovery.json")
ITB_ROOT = Path(r"G:\My Drive\HPD_Bid_Management_Project\Scripts\Diagnostics script\ITB_Downloads_V5")

BACKUP_PATH.write_text(JSON_PATH.read_text(encoding="utf-8"), encoding="utf-8")
jobs = json.loads(JSON_PATH.read_text(encoding="utf-8"))

BAD = [
    "job description on omo",
    "no bids will be accepted",
    "bids will be deemed",
    "invitation to bid quotation sheet",
    "bid certification",
    "scope of work is described on the attached copy",
    "you must certify your bid price",
    "emergency operations division, 100 gold street",
]

def get(job, *keys):
    for key in keys:
        value = job.get(key)
        if value is not None and str(value).strip():
            return str(value).strip()
    return ""

def is_bad(text):
    t = str(text or "").lower()
    return any(x in t for x in BAD)

def find_pdf(file_name):
    if not file_name:
        return None
    direct = ITB_ROOT / file_name
    if direct.exists():
        return direct
    alt = ITB_ROOT / file_name.replace(".pdf", " (1).pdf")
    if alt.exists():
        return alt
    matches = list(ITB_ROOT.rglob(file_name))
    return matches[0] if matches else None

def clean(text):
    text = text.replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r" +\n", "\n", text)
    return text.strip()

def pypdf_pages_3_4(pdf):
    pages = []
    try:
        reader = PdfReader(str(pdf))
        for idx in [2, 3]:
            if idx < len(reader.pages):
                pages.append(clean(reader.pages[idx].extract_text() or ""))
    except Exception:
        pass
    return pages

def ocr_pages_3_4(pdf):
    pages = []
    with tempfile.TemporaryDirectory() as tmp:
        prefix = str(Path(tmp) / "page")
        subprocess.run(
            ["pdftoppm", "-r", "220", "-png", "-f", "3", "-l", "4", str(pdf), prefix],
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
    best = ""

    for page in pages:
        if not page:
            continue

        upper = page.upper()

        if "JOB DESCRIPTION" not in upper:
            continue

        if "INVITATION TO BID QUOTATION SHEET" in upper:
            continue

        start = upper.find("JOB DESCRIPTION")
        desc = page[start:]
        desc = re.sub(r"(?is)^.*?JOB DESCRIPTION\s*:?", "", desc).strip()

        stop_markers = [
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
        for marker in stop_markers:
            pos = du.find(marker)
            if pos > 80 and (stop == -1 or pos < stop):
                stop = pos

        if stop > 0:
            desc = desc[:stop].strip()

        desc = clean(desc)

        if len(desc) < 30:
            continue
        if is_bad(desc):
            continue

        if len(desc) > len(best):
            best = desc

    return best[:7000]

targets = []
for job in jobs:
    desc = get(job, "JobDescription", "description", "Job_Description")
    itb = get(job, "ITBFile", "itbFile")

    if itb and (not desc or is_bad(desc)):
        targets.append(job)

print("Targets:", len(targets))

patched = 0
failed = 0
missing_pdf = 0
samples = []

for job in targets:
    omo = get(job, "OMO", "id")
    address = get(job, "BuildingAddress", "address")
    itb = get(job, "ITBFile", "itbFile")
    pdf = find_pdf(itb)

    if not pdf:
        missing_pdf += 1
        continue

    desc = extract_desc(pypdf_pages_3_4(pdf))

    if not desc:
        try:
            desc = extract_desc(ocr_pages_3_4(pdf))
        except Exception:
            desc = ""

    if not desc:
        failed += 1
        continue

    job["JobDescription"] = desc
    job["description"] = desc
    job["Job_Description"] = desc
    job["DescriptionSource"] = "ITB_PAGE_3_4"
    job["descriptionSource"] = "ITB_PAGE_3_4"

    patched += 1

    if len(samples) < 12:
        samples.append({
            "OMO": omo,
            "Address": address,
            "Preview": desc[:180].replace("\n", " ")
        })

JSON_PATH.write_text(json.dumps(jobs, indent=2), encoding="utf-8")

print("Patched:", patched)
print("Missing PDF:", missing_pdf)
print("Failed:", failed)
print("Backup:", BACKUP_PATH)

print("\nSamples:")
for s in samples:
    print(s)
