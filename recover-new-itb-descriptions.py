import json
import re
import subprocess
import tempfile
from pathlib import Path
from PyPDF2 import PdfReader
JSON_PATH = Path("data/COA_Fetcher_2026.json")
BACKUP_PATH = Path("data/COA_Fetcher_2026.before_deep_description_recovery.json")
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
REAL_WORK_WORDS = [
    "install", "replace", "repair", "remove", "provide", "furnish", "correct",
    "secure", "paint", "plaster", "patch", "clean", "seal", "restore", "abate",
    "door", "lock", "latch", "ceiling", "wall", "floor", "window", "pipe",
    "leak", "sink", "toilet", "radiator", "electrical", "fixture", "cabinet",
    "public hall", "vestibule", "apartment", "kitchen", "bathroom", "room",
]
SKIP_LINE_MARKERS = [
    "invitation to bid",
    "quotation sheet",
    "bid certification",
    "prepared by",
    "signature",
    "permit required",
    "sidewalk bridge required",
    "omo no",
    "form no",
    "page ",
    "vendor id",
    "bid amount",
    "total amount",
    "fax",
    "telephone",
    "email",
]
STOP_MARKERS = [
    "CONTRACTOR MUST CONTACT",
    "IF NO WORK IS PERFORMED",
    "IF LANDLORD REFUSES",
    "AFFIDAVIT COPY",
    "WORK DESCRIPTION FORM",
    "PERMIT REQUIRED",
    "SIDEWALK BRIDGE REQUIRED",
    "FORM NO.",
    "VENDOR MUST",
    "PREPARED BY:",
    "SIGNATURE:",
    "BID CERTIFICATION",
]
def get(job, *keys):
    for key in keys:
        value = job.get(key)
        if value is not None and str(value).strip():
            return str(value).strip()
    return ""
def clean(text):
    text = str(text or "").replace("\r", "\n")
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
def looks_like_scope(text):
    value = clean(text)
    lower = value.lower()
    if len(value) < 35:
        return False
    if is_bad(value):
        return False
    hits = sum(1 for word in REAL_WORK_WORDS if word in lower)
    return hits >= 2
def trim_at_stop(text):
    value = clean(text)
    upper = value.upper()
    stop = -1
    for marker in STOP_MARKERS:
        pos = upper.find(marker)
        if pos > 60 and (stop == -1 or pos < stop):
            stop = pos
    if stop > 0:
        value = value[:stop].strip()
    return clean(value)
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
    add(find_pdf(preferred_file))
    if omo:
        for pdf in ITB_ROOT.rglob("*.pdf"):
            if omo.upper() in pdf.name.upper():
                add(pdf)
    for pdf in ITB_ROOT.rglob("*.pdf"):
        name = pdf.name.lower()
        if "faxcopy" in name or "fax" in name or "itb" in name:
            add(pdf)
    return candidates
def pypdf_pages(pdf):
    pages = []
    try:
        reader = PdfReader(str(pdf))
        for page in reader.pages:
            pages.append(clean(page.extract_text() or ""))
    except Exception:
        pass
    return pages
def ocr_pages(pdf, first=1, last=12):
    pages = []
    with tempfile.TemporaryDirectory() as tmp:
        prefix = str(Path(tmp) / "page")
        subprocess.run(
            ["pdftoppm", "-r", "260", "-png", "-f", str(first), "-l", str(last), str(pdf), prefix],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        for img in sorted(Path(tmp).glob("*.png")):
            best = ""
            for psm in ["4", "6", "11"]:
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
def pdf_mentions_omo(pdf, omo):
    if not omo:
        return True
    try:
        if omo.upper() in "\n".join(pypdf_pages(pdf)).upper():
            return True
    except Exception:
        pass
    try:
        if omo.upper() in "\n".join(ocr_pages(pdf, 1, 3)).upper():
            return True
    except Exception:
        pass
    return False
def line_fallback(page):
    lines = [ln.strip() for ln in clean(page).splitlines() if ln.strip()]
    kept = []
    for ln in lines:
        low = ln.lower()
        if any(marker in low for marker in SKIP_LINE_MARKERS):
            continue
        if re.fullmatch(r"[\W\d_ ]{1,30}", ln):
            continue
        kept.append(ln)
    # Try chunks of nearby useful lines, not whole packet.
    candidates = []
    for i in range(len(kept)):
        chunk = "\n".join(kept[i:i + 8])
        chunk = trim_at_stop(chunk)
        if looks_like_scope(chunk):
            candidates.append((len(chunk), chunk))
    if candidates:
        candidates.sort(key=lambda x: x[0], reverse=True)
        return candidates[0][1]
    merged = trim_at_stop("\n".join(kept))
    return merged if looks_like_scope(merged) else ""
def extract_desc_from_pages(pages):
    candidates = []
    for index, page in enumerate(pages):
        if not page:
            continue
        upper = page.upper()
        starts = []
        for marker in [
            "JOB DESCRIPTION:",
            "JOB DESCRIPTION",
            "SCOPE OF WORK:",
            "SCOPE OF WORK",
            "WORK TO BE PERFORMED:",
            "WORK TO BE PERFORMED",
            "DESCRIPTION:",
            "DESCRIPTION",
            "REPAIR DESCRIPTION:",
            "REPAIR DESCRIPTION",
        ]:
            pos = upper.find(marker)
            if pos >= 0:
                starts.append(pos + len(marker))
        for start in starts:
            desc = trim_at_stop(page[start:])
            if looks_like_scope(desc):
                score = len(desc)
                if "SCOPE OF WORK" in upper or "JOB DESCRIPTION" in upper:
                    score += 500
                if index >= 2:
                    score += 100
                candidates.append((score, desc[:7000]))
        fallback = line_fallback(page)
        if fallback:
            score = len(fallback)
            if index >= 2:
                score += 100
            candidates.append((score, fallback[:7000]))
    if not candidates:
        return ""
    candidates.sort(key=lambda x: x[0], reverse=True)
    return candidates[0][1]
def recover_description_from_pdf(pdf):
    pages = pypdf_pages(pdf)
    desc = extract_desc_from_pages(pages)
    if not desc:
        try:
            pages = ocr_pages(pdf, 1, 12)
            desc = extract_desc_from_pages(pages)
        except Exception:
            desc = ""
    return desc
targets = []
for job in jobs:
    desc = get(job, "JobDescription", "description", "Job_Description")
    itb = get(job, "ITBFile", "itbFile")
    status = get(job, "ITBMatchStatus", "itbMatchStatus", "status").upper()
    if itb and status != "NO_ITB" and not desc:
        targets.append(job)
print("Matched ITBs needing description:", len(targets))
patched = 0
missing_pdf = 0
failed = 0
samples = []
for job in targets:
    omo = get(job, "OMO", "id")
    address = get(job, "BuildingAddress", "address")
    itb = get(job, "ITBFile", "itbFile")
    candidates = candidate_pdfs_for_omo(omo, itb)
    if not candidates:
        missing_pdf += 1
        job["DescriptionRecoveryReason"] = "No ITB PDF candidate found for OMO"
        job["descriptionRecoveryReason"] = job["DescriptionRecoveryReason"]
        continue
    desc = ""
    used_pdf = ""
    for pdf in candidates:
        if pdf.name != itb and not pdf_mentions_omo(pdf, omo):
            continue
        possible = recover_description_from_pdf(pdf)
        if possible and not is_bad(possible):
            desc = possible
            used_pdf = pdf.name
            break
    if not desc:
        failed += 1
        job["DescriptionNeedsReview"] = True
        job["descriptionNeedsReview"] = True
        job["DescriptionRecoveryReason"] = "No readable real scope found in matched ITB PDFs"
        job["descriptionRecoveryReason"] = job["DescriptionRecoveryReason"]
        continue
    job["JobDescription"] = desc
    job["description"] = desc
    job["Job_Description"] = desc
    job["DescriptionSource"] = "DEEP_FAX_ITB_SCOPE_RECOVERY"
    job["descriptionSource"] = "DEEP_FAX_ITB_SCOPE_RECOVERY"
    job["DescriptionRecoveredFromFile"] = used_pdf
    job["descriptionRecoveredFromFile"] = used_pdf
    job["DescriptionNeedsReview"] = False
    job["descriptionNeedsReview"] = False
    job["DescriptionRecoveryReason"] = ""
    job["descriptionRecoveryReason"] = ""
    patched += 1
    print("DESCRIPTION OK", omo, used_pdf)
    if len(samples) < 12:
        samples.append({
            "OMO": omo,
            "Address": address,
            "RecoveredFrom": used_pdf,
            "Preview": desc[:220].replace("\n", " ")
        })
JSON_PATH.write_text(json.dumps(jobs, indent=2), encoding="utf-8")
print("Descriptions patched:", patched)
print("Missing PDF:", missing_pdf)
print("Failed:", failed)
print("Backup:", BACKUP_PATH)
print("\nSamples:")
for sample in samples:
    print(sample)
