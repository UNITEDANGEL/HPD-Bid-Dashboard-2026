import json
import re
import subprocess
import tempfile
from pathlib import Path
from PyPDF2 import PdfReader

JSON_PATH = Path("data/COA_Fetcher_2026.json")
ITB_ROOT = Path(r"G:\My Drive\HPD_Bid_Management_Project\Scripts\Diagnostics script\ITB_Downloads_V5")
OUT = Path("itb_scope_inspection_report.txt")

SAMPLES = [
    "EQ23582", # 49 Nixon
    "EQ15489",
    "EQ15665",
    "EQ15760",
    "EQ14157",
]

jobs = json.loads(JSON_PATH.read_text(encoding="utf-8"))

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
    alt = ITB_ROOT / file_name.replace(".pdf", " (1).pdf")
    if alt.exists():
        return alt
    matches = list(ITB_ROOT.rglob(file_name))
    return matches[0] if matches else None

def clean(text):
    text = text.replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()

def pypdf_text(pdf):
    try:
        reader = PdfReader(str(pdf))
        chunks = []
        for i, page in enumerate(reader.pages):
            chunks.append(f"\n\n--- PYPDF PAGE {i+1} ---\n")
            chunks.append(page.extract_text() or "")
        return clean("".join(chunks))
    except Exception as e:
        return f"PyPDF failed: {e}"

def ocr_pages(pdf):
    with tempfile.TemporaryDirectory() as tmp:
        prefix = str(Path(tmp) / "page")
        subprocess.run(
            ["pdftoppm", "-r", "240", "-png", "-f", "1", "-l", "4", str(pdf), prefix],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

        chunks = []
        for img in sorted(Path(tmp).glob("*.png")):
            chunks.append(f"\n\n--- OCR {img.name} PSM 6 ---\n")
            result = subprocess.run(
                ["tesseract", str(img), "stdout", "-l", "eng", "--psm", "6"],
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                text=True,
                encoding="utf-8",
                errors="ignore",
            )
            chunks.append(result.stdout or "")

            chunks.append(f"\n\n--- OCR {img.name} PSM 4 ---\n")
            result = subprocess.run(
                ["tesseract", str(img), "stdout", "-l", "eng", "--psm", "4"],
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                text=True,
                encoding="utf-8",
                errors="ignore",
            )
            chunks.append(result.stdout or "")

        return clean("".join(chunks))

lines = []

for omo in SAMPLES:
    job = next((j for j in jobs if get(j, "OMO", "id") == omo), None)
    if not job:
        continue

    itb = get(job, "ITBFile", "itbFile")
    pdf = find_pdf(itb)

    lines.append("=" * 100)
    lines.append(f"OMO: {omo}")
    lines.append(f"Address: {get(job, 'BuildingAddress', 'address')}")
    lines.append(f"ITB: {itb}")
    lines.append(f"PDF: {pdf}")
    lines.append("=" * 100)

    if not pdf:
        lines.append("PDF NOT FOUND")
        continue

    lines.append("\n\n################ PYPDF TEXT ################")
    lines.append(pypdf_text(pdf)[:12000])

    lines.append("\n\n################ OCR TEXT ################")
    lines.append(ocr_pages(pdf)[:16000])

OUT.write_text("\n".join(lines), encoding="utf-8")
print("Wrote:", OUT)
