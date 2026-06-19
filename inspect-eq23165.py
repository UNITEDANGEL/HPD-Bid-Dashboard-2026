import json
import re
import subprocess
import tempfile
from pathlib import Path

JSON_PATH = Path("data/COA_Fetcher_2026.json")
ITB_ROOT = Path(r"G:\My Drive\HPD_Bid_Management_Project\Scripts\Diagnostics script\ITB_Downloads_V5")
OUT = Path("EQ23165_ocr_pages_1_12.txt")

jobs = json.loads(JSON_PATH.read_text(encoding="utf-8"))
job = next(j for j in jobs if (j.get("OMO") or j.get("id")) == "EQ23165")

itb = job.get("ITBFile") or job.get("itbFile")
pdf = ITB_ROOT / itb

if not pdf.exists():
    matches = list(ITB_ROOT.rglob(itb))
    if matches:
        pdf = matches[0]

print("ITB:", itb)
print("PDF:", pdf)

def clean(text):
    text = text.replace("\r", "\n")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()

with tempfile.TemporaryDirectory() as tmp:
    prefix = str(Path(tmp) / "page")

    subprocess.run(
        ["pdftoppm", "-r", "250", "-png", "-f", "1", "-l", "12", str(pdf), prefix],
        check=True
    )

    parts = []
    for img in sorted(Path(tmp).glob("*.png")):
        parts.append("\n" + "=" * 80)
        parts.append(f"OCR IMAGE: {img.name}")
        parts.append("=" * 80)

        for psm in ["4", "6", "11"]:
            result = subprocess.run(
                ["tesseract", str(img), "stdout", "-l", "eng", "--psm", psm],
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
                text=True,
                encoding="utf-8",
                errors="ignore",
            )
            parts.append(f"\n--- PSM {psm} ---\n")
            parts.append(clean(result.stdout or ""))

OUT.write_text("\n".join(parts), encoding="utf-8")
print("Wrote:", OUT)
