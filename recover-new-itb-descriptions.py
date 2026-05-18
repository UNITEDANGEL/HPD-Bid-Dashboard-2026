import json
import re
import subprocess
import tempfile
from pathlib import Path
from PyPDF2 import PdfReader

JSON_PATH = Path("data/COA_Fetcher_2026.json")
BACKUP_PATH = Path("data/COA_Fetcher_2026.before_new_itb_description_recovery.json")
ITB_ROOT = Path("ITB_Downloads_V5")

BACKUP_PATH.write_text(JSON_PATH.read_text(encoding="utf-8"), encoding="utf-8")
jobs = json.loads(JSON_PATH.read_text(encoding="utf-8"))

BAD_MARKERS = [
    "job description on omo",
    "no bids will be accepted",
    "bids will be deemed non-responsive",
    "invitation to bid quotation sheet",
    "bid certification",
    "scope of work is described on the attached copy",
    "you must certify your bid price",
]

def get(job, *keys):
    for key in keys:
        value = job.get(key)
        if value is not None and str(value).strip():
            return str(value).strip()
    return ""

def clean(text):
    text = text.replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r" +\n", "\n", text)
    return text.strip()

def is_bad(desc):
    text = str(desc or "").lower()
    return (
        not text.strip()
        or any(marker in text for marker in BAD_MARKERS)
        or re.match(r"^page\s+\d+\s+of\s+\d+", str(desc or ""), re.I)
    )

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

def candidate_pdfs_for_omo(omo, preferred_file=""):
    candidates = []
    seen = set()
    def add(pdf):
        if not pdf:
            return
        try:
            key = str(pdf.resolve())
        except Exception:
            key = str(pdf)
        if pdf.exists() and key not in seen:
            seen.add(key)
            candidates.append(pdf)
    # 1) Preferred file from the row.
    add(find_pdf(preferred_file))
    # 2) Any filename containing the OMO.
    if omo:
        for pdf in ITB_ROOT.rglob("*.pdf"):
            name = pdf.name.upper()
            if omo.upper() in name:
                add(pdf)
    # 3) Fax-copy PDFs may not include OMO in filename. Try likely current fax PDFs too.
    for pdf in ITB_ROOT.rglob("*.pdf"):
        name = pdf.name.lower()
        if "faxcopy" in name or "fax" in name or "itb" in name:
            add(pdf)
    return candidates
def pdf_mentions_omo(pdf, omo):
    if not omo:
        return True
    try:
        pages = pypdf_pages(pdf)
        joined = "\n".join(pages).upper()
        if omo.upper() in joined:
            return True
    except Exception:
        pass
    try:
        pages = ocr_pages(pdf, 1, 3)
        joined = "\n".join(pages).upper()
        if omo.upper() in joined:
            return True
    except Exception:
        pass
    return False
def recover_description_from_pdf(pdf, omo):
    pages = pypdf_pages(pdf)
    desc = extract_desc(pages)
    if not desc:
        try:
            # Current/fax ITBs can have scope pages after page 6.
            pages = ocr_pages(pdf, 1, 10)
            desc = extract_desc(pages)
        except Exception:
            desc = ""
    if not desc and "extract_fax_scope_fallback" in globals():
        try:
            desc = extract_fax_scope_fallback(pages, omo)
        except Exception:
            desc = ""
    return desc
def pypdf_pages(pdf):
    pages = []
    try:
        reader = PdfReader(str(pdf))
        for page in reader.pages:
            pages.append(clean(page.extract_text() or ""))
    except Exception:
        pass
    return pages

def ocr_pages(pdf, first=1, last=6):
    pages = []

    with tempfile.TemporaryDirectory() as tmp:
        prefix = str(Path(tmp) / "page")

        subprocess.run(
            ["pdftoppm", "-r", "240", "-png", "-f", str(first), "-l", str(last), str(pdf), prefix],
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

    for index, page in enumerate(pages):
        if not page:
            continue

        upper = page.upper()

        # Prefer real ITB scope page.
        if "JOB DESCRIPTION" not in upper and "SCOPE OF WORK" not in upper:
            continue

        if "INVITATION TO BID QUOTATION SHEET" in upper:
            continue

        start = -1
        marker_used = ""

        for marker in ["JOB DESCRIPTION:", "JOB DESCRIPTION", "SCOPE OF WORK:", "SCOPE OF WORK"]:
            pos = upper.find(marker)
            if pos >= 0:
                start = pos + len(marker)
                marker_used = marker
                break

        if start < 0:
            continue

        desc = page[start:].strip()

        stops = [
            "CONTRACTOR MUST CONTACT",
            "IF NO WORK IS PERFORMED",
            "IF LANDLORD REFUSES",
            "AFFIDAVIT COPY",
            "WORK DESCRIPTION FORM",
            "PERMIT REQUIRED",
            "FORM NO.",
            "VENDOR MUST",
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

        if len(desc) < 30:
            continue
        if is_bad(desc):
            continue

        score = len(desc)
        if "SCOPE OF WORK" in upper:
            score += 500
        if "OMO NO" in upper:
            score += 250
        if index >= 2:
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
    source = get(job, "FetchMergeSource", "fetchMergeSource")
    status = get(job, "ITBMatchStatus", "itbMatchStatus", "status").upper()

    if source == "SAFE_7DAY_FETCH" and itb and status != "NO_ITB" and not desc:
        targets.append(job)

print("Matched new ITBs needing description:", len(targets))

patched = 0
missing_pdf = 0
failed = 0
samples = []

for job in targets:
    omo = get(job, "OMO", "id")
    address = get(job, "BuildingAddress", "address")
    itb = get(job, "ITBFile", "itbFile")
    pdf = find_pdf(itb)

    if not pdf:
        missing_pdf += 1
        continue

    pages = pypdf_pages(pdf)
    desc = extract_desc(pages)

    if not desc:
        try:
            # Fax copies often need OCR; pages 1-6 catches odd packet order.
            pages = ocr_pages(pdf, 1, 6)
            desc = extract_desc(pages)
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
    job["DescriptionSource"] = "CURRENT_OR_ALTERNATE_ITB_SCOPE_RECOVERY"
    job["descriptionSource"] = "CURRENT_OR_ALTERNATE_ITB_SCOPE_RECOVERY"
    job["DescriptionRecoveredFromFile"] = used_pdf
    job["descriptionRecoveredFromFile"] = used_pdf
    job["DescriptionNeedsReview"] = False
    job["descriptionNeedsReview"] = False

    patched += 1

    if len(samples) < 12:
        samples.append({
            "OMO": omo,
            "Address": address,
            "Preview": desc[:180].replace("\n", " ")
        })

JSON_PATH.write_text(json.dumps(jobs, indent=2), encoding="utf-8")

print("Descriptions patched:", patched)
print("Missing PDF:", missing_pdf)
print("Failed:", failed)
print("Backup:", BACKUP_PATH)

print("\nSamples:")
for sample in samples:
    print(sample)




