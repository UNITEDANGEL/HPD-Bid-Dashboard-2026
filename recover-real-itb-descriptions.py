import json
import re
import subprocess
import tempfile
from pathlib import Path
from PyPDF2 import PdfReader

JSON_PATH = Path("data/COA_Fetcher_2026.json")
BACKUP_PATH = Path("data/COA_Fetcher_2026.before_real_itb_scope_recovery.json")
ITB_ROOT = Path(r"G:\My Drive\HPD_Bid_Management_Project\Scripts\Diagnostics script\ITB_Downloads_V5")

BACKUP_PATH.write_text(JSON_PATH.read_text(encoding="utf-8"), encoding="utf-8")
jobs = json.loads(JSON_PATH.read_text(encoding="utf-8"))

GENERIC_MARKERS = [
    "is described on the attached copy of the omo",
    "job description on omo",
    "no bids will be accepted",
    "emergency operations division, 100 gold street",
    "you must certify your bid price",
    "bids will be deemed non-responsive",
    "invitation to bid quotation sheet",
    "bid certification",
    "your price quotation will be considered",
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

    direct = ITB_ROOT / file_name
    if direct.exists():
        return direct

    alt = ITB_ROOT / file_name.replace(".pdf", " (1).pdf")
    if alt.exists():
        return alt

    matches = list(ITB_ROOT.rglob(file_name))
    return matches[0] if matches else None

def clean_text(text):
    text = text.replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r" +\n", "\n", text)
    return text.strip()

def read_pypdf_pages(pdf_path):
    pages = []
    try:
        reader = PdfReader(str(pdf_path))
        for page in reader.pages:
            pages.append(clean_text(page.extract_text() or ""))
    except Exception:
        pass
    return pages

def ocr_pdf_pages(pdf_path):
    pages = []

    with tempfile.TemporaryDirectory() as tmp:
        prefix = str(Path(tmp) / "page")

        subprocess.run(
            ["pdftoppm", "-r", "240", "-png", str(pdf_path), prefix],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

        for image in sorted(Path(tmp).glob("*.png")):
            best = ""

            for psm in ["6", "4"]:
                result = subprocess.run(
                    ["tesseract", str(image), "stdout", "-l", "eng", "--psm", psm],
                    check=False,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.DEVNULL,
                    text=True,
                    encoding="utf-8",
                    errors="ignore",
                )
                text = clean_text(result.stdout or "")
                if len(text) > len(best):
                    best = text

            pages.append(best)

    return pages

def extract_scope_from_pages(pages):
    candidates = []

    for idx, page in enumerate(pages):
        if not page:
            continue

        upper = page.upper()

        # The real scope page has these signals.
        has_job_desc = "JOB DESCRIPTION" in upper
        has_omo_page = "OMO NO:" in upper or "OMO #" in upper
        has_bldg = "BLDG ADDRESS" in upper or "BUILDING ADDRESS" in upper
        has_scope = "SCOPE OF WORK" in upper

        if not has_job_desc and not has_scope:
            continue

        # Avoid page 1 invitation boilerplate unless it also has real scope signals.
        if "INVITATION TO BID QUOTATION SHEET" in upper and not has_scope:
            continue

        start = -1
        for marker in ["JOB DESCRIPTION:", "JOB DESCRIPTION", "SCOPE OF WORK:", "SCOPE OF WORK"]:
            pos = upper.find(marker)
            if pos >= 0:
                start = pos + len(marker)
                break

        if start < 0:
            continue

        desc = page[start:].strip()

        # Stop at affidavit/access/fax instructions, but keep the actual scope before it.
        stop_markers = [
            "CONTRACTOR MUST CONTACT",
            "IF NO WORK IS PERFORMED",
            "IF LANDLORD REFUSES",
            "AFFIDAVIT COPY",
            "WORK DESCRIPTION FORM",
            "PERMIT REQUIRED",
            "FORM NO.",
        ]

        desc_upper = desc.upper()
        stop = -1

        for marker in stop_markers:
            pos = desc_upper.find(marker)
            if pos > 80 and (stop == -1 or pos < stop):
                stop = pos

        if stop > 0:
            desc = desc[:stop].strip()

        desc = clean_text(desc)

        # Reject bad text.
        if len(desc) < 30:
            continue
        if is_generic(desc):
            continue
        if desc.upper().startswith("ON OMO"):
            continue
        if "NO BIDS WILL BE ACCEPTED" in desc.upper():
            continue

        score = len(desc)
        if has_scope:
            score += 500
        if has_omo_page and has_bldg:
            score += 250
        if idx >= 2:
            score += 150

        candidates.append((score, desc))

    if not candidates:
        return ""

    candidates.sort(key=lambda x: x[0], reverse=True)
    return candidates[0][1][:7000]

targets = []
for job in jobs:
    desc = get(job, "JobDescription", "description", "Job_Description")
    itb = get(job, "ITBFile", "itbFile")

    if itb and (not desc or is_generic(desc)):
        targets.append(job)

print("Targets needing real ITB scope extraction:", len(targets))

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

    pages = read_pypdf_pages(pdf)
    desc = extract_scope_from_pages(pages)

    if not desc:
        try:
            ocr_pages = ocr_pdf_pages(pdf)
            desc = extract_scope_from_pages(ocr_pages)
        except Exception:
            desc = ""

    if not desc:
        failed += 1
        job["DescriptionNeedsReview"] = True
        job["descriptionNeedsReview"] = True
        continue

    job["JobDescription"] = desc
    job["description"] = desc
    job["Job_Description"] = desc
    job["DescriptionSource"] = "ITB_SCOPE_PAGE"
    job["descriptionSource"] = "ITB_SCOPE_PAGE"
    job["DescriptionNeedsReview"] = False
    job["descriptionNeedsReview"] = False

    patched += 1

    if len(samples) < 12:
        samples.append({
            "OMO": omo,
            "Address": address,
            "Preview": desc[:220].replace("\n", " ")
        })

JSON_PATH.write_text(json.dumps(jobs, indent=2), encoding="utf-8")

print("Real ITB descriptions patched:", patched)
print("Missing ITB PDF:", missing_pdf)
print("Failed/review needed:", failed)
print("Backup:", BACKUP_PATH)

print("\nSamples:")
for sample in samples:
    print(sample)
