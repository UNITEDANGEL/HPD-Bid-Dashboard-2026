"""Generate isolated sample paperwork without touching live work orders."""
import json
import sys
from pathlib import Path

import fitz

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT.parent / "Scripts"))
import unified_dashboard_support as support

OUT = ROOT / "output" / "pdf" / "sample-scenarios"
OUT.mkdir(parents=True, exist_ok=True)
for name in ("GENERATED_AFFIDAVITS_DIR", "GENERATED_INVOICES_DIR", "JOB_CARDS_DIR", "RECORDS_DIR"):
    target = OUT / name.lower()
    target.mkdir(exist_ok=True)
    setattr(support, name, target)

scenarios = [
    ("legacy-work", "2026-08-27", "Work Completed", "Work Completed", "legacy"),
    ("cutoff-work", "2026-08-28", "Work Completed", "Work Completed", "current"),
    ("current-no-access", "2026-09-15", "No Access", "No Work Completed", "current"),
    ("current-refused", "2026-09-15", "Refused Access", "No Work Completed", "current"),
    ("current-other", "2026-09-15", "Work Completed by Other", "No Work Completed", "current"),
    ("legacy-no-work", "2026-08-27", "No Access", "No Work Completed", "legacy"),
    ("current-partial", "2026-09-15", "Partial Work", "Work Completed", "current"),
    ("legacy-partial", "2026-08-27", "Partial Work", "Work Completed", "legacy"),
]
results = []
for name, award, status, kind, version in scenarios:
    row = {
        "OMO": f"TEST-{name}", "BuildingAddress": "100 SAMPLE STREET - TEST ONLY",
        "Borough": "Queens", "AwardDate": award, "WorkStartDate": "2026-09-18",
        "WorkCompletionDate": "2026-09-18", "Status": status,
        "display_description": "TEST ONLY: Repair sample door hardware.",
        "Trade": "Carpentry", "attempt1_date": "2026-09-18",
        "no_work_reason": status, "denied_person_name": "Sample Person",
        "denied_relationship": "Sample tenant", "denied_description": "Test description",
        "other_worker_name": "Sample Contractor", "other_worker_relationship": "Owner contractor",
        "attempt2_date": "2026-09-19",
    }
    if "partial" in name:
        row.update(partial_reason="TEST ONLY: Remaining work requires replacement hardware.",
                   partial_amount_1="50.00", partial_amount_2="50.00",
                   name_of_person="Sample Person", relationship_to_building="Tenant",
                   description_of_person="Sample description")
    assert support.affidavit_template_version_for_row(row) == version
    bundle = support.generate_document_bundle(row, kind)
    for path in (bundle.invoice_path, bundle.affidavit_path, bundle.job_card_path):
        assert Path(path).is_relative_to(OUT)
        doc = fitz.open(path)
        assert len(doc) > 0
        if path != bundle.job_card_path:
            assert row["OMO"] in "".join(page.get_text() for page in doc), path
    affidavit = fitz.open(bundle.affidavit_path)
    previews = []
    for index, page in enumerate(affidavit):
        preview = OUT / f"{name}-page-{index + 1}.png"
        page.get_pixmap(matrix=fitz.Matrix(1.4, 1.4)).save(preview)
        previews.append(str(preview))
    results.append({"scenario": name, "version": version, "affidavit": bundle.affidavit_path,
                    "invoice": bundle.invoice_path, "previews": previews})
(OUT / "results.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
from PIL import Image, ImageDraw
for result in results:
    pages = [Image.open(path).convert("RGB") for path in result["previews"]]
    invoice = fitz.open(result["invoice"])
    for page in invoice:
        pix = page.get_pixmap(matrix=fitz.Matrix(1.4, 1.4))
        pages.append(Image.frombytes("RGB", (pix.width, pix.height), pix.samples))
    sheet = Image.new("RGB", (600 * len(pages), 820), "white")
    for index, page in enumerate(pages):
        page.thumbnail((590, 780))
        sheet.paste(page, (600 * index, 30))
    ImageDraw.Draw(sheet).text((10, 8), result["scenario"] + " - affidavit pages then invoice", fill="black")
    sheet.save(OUT / (result["scenario"] + "-review.png"))
print(json.dumps({"generation_checks_passed": len(results), "visual_approval": "Requires separate review; generation does not establish correctness", "output": str(OUT)}, indent=2))
