"""Clean copies of HPD's pre-August 28, 2026 affidavits ("12.2024 Rev. 01.21.2025") for the paperwork page.

The originals' boxes are numbered ("1", "2", ...) and pdf-lib can't read their file structure. This
names each box like the current forms (OMO, County Of, Deponent Name, ...), so the same filler fills
both versions, and re-saves the file cleanly. Meanings come from the printed form text next to each
box and the earlier filler (worker/affidavits/fill_*_affidavit_working.py: box 4 = award date).
Run: python scripts/build_legacy_affidavits.py
"""
import fitz

WORK = {
    ("0", "1"): "OMO", ("0", "2"): "County Of", ("0", "3"): "Deponent Name", ("0", "4"): "Award Date",
    ("0", "5"): "Building Address", ("0", "6"): "Start Date", ("0", "7"): "Complete Date", ("0", "8"): "Partial Reason",
    ("0", "9"): "Partial Amount", ("0", "10"): "Interrupted Amount",
    ("1", "1"): "OMO", ("1", "11"): "Denied Name", ("1", "13"): "Denied Relationship", ("1", "14"): "Denied Description",
    ("1", "15"): "Type or Print Name", ("1", "19"): "Notary Day", ("1", "21"): "Notary Month", ("1", "22"): "Notary Year",
}
NO_WORK = {
    ("0", "1"): "OMO", ("0", "2"): "County Of", ("0", "3"): "Deponent Name", ("0", "23"): "Building Address",
    ("0", "4"): "Service Charge Amount", ("0", "5"): "Inaccessible Reason", ("0", "6"): "Inaccessible Reason 2",
    ("0", "7"): "Attempt1 Date", ("0", "9"): "Attempt2 Date", ("0", "8"): "Phone1 Date", ("0", "10"): "Phone2 Date",
    ("0", "11"): "WorkSite Date5", ("0", "12"): "WorkSite Date6", ("0", "13"): "Others Name",
    ("1", "1"): "OMO", ("1", "14"): "Denied Date", ("1", "15"): "Denied Name", ("1", "16"): "Denied Relationship",
    ("1", "17"): "Denied Description", ("1", "18"): "Denied Phone", ("1", "50"): "Type or Print Name",
    ("1", "19"): "Notary Day", ("1", "21"): "Notary Month", ("1", "22"): "Notary Year",
}

# The OMO number appears 3 times as one shared box "1": split into the names the filler sets.
def omo_name(page, rect):
    if page == 1:
        return "OMO Header2"
    return "OMO" if rect.y0 < 120 else "OMO Body"

def build(src, dst, names):
    with fitz.open(src) as doc:
        out = fitz.open()
        out.insert_pdf(doc, widgets=False)  # page content only, cleanly written; boxes added fresh below
        seen = set()
        for page in doc:
            for w in page.widgets():
                key = (str(page.number), w.field_name)
                new = names.get(key)
                assert new, f"unmapped box {key} in {src}"
                seen.add(key)
                if new == "OMO":
                    new = omo_name(page.number, w.rect)
                box = fitz.Widget()
                box.field_type = fitz.PDF_WIDGET_TYPE_TEXT
                box.field_name = new
                box.rect = w.rect
                box.text_font = "Helv"
                box.text_fontsize = 0
                box.border_width = 0
                out[page.number].add_widget(box)
        assert seen == set(names), f"missing boxes {set(names) - seen} in {src}"
        out.save(dst, garbage=4, deflate=True)
        out.close()
    print("wrote", dst)

build("templates/Locked_AFFIDAVIT OF WORK PERFORMED 12.2024 Rev. 01.21.2025.pdf", "public/templates/work-performed-affidavit-2025.pdf", WORK)
build("templates/Locked_AFFIDAVIT OF NO WORK PERFORMED 12.2024 Rev. 01.21.2025.pdf", "public/templates/no-work-performed-affidavit-2025.pdf", NO_WORK)
