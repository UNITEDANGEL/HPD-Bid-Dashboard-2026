# =======================================================
# Work Completed Affidavit – Final Script (Auto Folder Fix)
# =======================================================

import os
from pdf2image import convert_from_path
from PIL import ImageDraw, ImageFont

# ==============================
# FONT (locked to your path)
# ==============================
def get_font(size=40):
    font_path = r"G:\My Drive\HPD_OMO_PIPELINE_2025\Scripts\DejaVuSans-Bold.ttf"
    try:
        return ImageFont.truetype(font_path, size)
    except OSError:
        print(f"⚠️ Could not open {font_path}, falling back to default font.")
        return ImageFont.load_default()

font_black = get_font(40)

# ==============================
# PAGE 1 – FINAL COORDS (LOCKED)
# ==============================
coords_page1_final = {
    "OMO_Header": (1100, 420),
    "AwardDate": (470, 1246),
    "AffiantName": (80, 960),
    "BuildingAddress": (350, 1320),
    "OMO_Body": (400, 1590),
    "PartialReason": (290, 2510),
    "PartialAmount1": (1629, 2574),
    "StartDate": (2078, 2245),
    "PartialAmount2": (362, 2911),
    "CompleteDate": (695, 2311),
}

# ==============================
# PAGE 2 – FINAL COORDS (LOCKED)
# ==============================
coords_page2_final = {
    "OMO": (1100, 190),
    "NameOfPerson": (1100, 475),
    "RelationshipToBuilding": (1100, 555),
    "DescriptionOfPerson": (1100, 690),
    "Signature": (1660, 835),
    "TypeOrPrintName": (1660, 1005),
    "NotarySeal": (1200, 1100),
    "NotaryDay": (515, 1150),
    "NotaryMonth": (785, 1150),
    "NotaryYear": (1110, 1150),
    "NotarySignature": (250, 1300),
}

# ==============================
# MULTI-PAGE FILL FUNCTION
# ==============================
def fill_affidavit(pdf_path, data, output_path):
    pages = convert_from_path(pdf_path, dpi=300)  # Always 300 dpi
    result = []

    for i, page in enumerate(pages, start=1):
        page = page.convert("RGB")
        draw = ImageDraw.Draw(page)

        coords = coords_page1_final if i == 1 else coords_page2_final

        for label, (x, y) in coords.items():
            value = data.get(label, "")
            draw.text((x, y), str(value), fill="black", font=font_black)

        result.append(page)

    # ✅ Auto-create folder if missing
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    # Save PDF
    result[0].save(
        output_path,
        save_all=True,
        append_images=result[1:],
        resolution=150.0
    )
    print(f"✅ Affidavit filled and saved to: {output_path}")

# ==============================
# SAMPLE DATA (for testing)
# ==============================
if __name__ == "__main__":
    sample_data = {
        # Page 1
        "OMO_Header": "EQ04541",
        "AwardDate": "08/01/2025",
        "AffiantName": "I,JOTJAGRAJ SINGH/UNITED ANGEL CONSTRUCTION CORP",
        "BuildingAddress": "52-07 94 STREET, QUEENS, NY",
        "OMO_Body": "EQ04541",
        "PartialReason": "ADDITIONAL WORK WAS NEEDED",
        "PartialAmount1": "$500",
        "StartDate": "09/01/2025",
        "PartialAmount2": "$400",
        "CompleteDate": "09/21/2025",

        # Page 2
        "OMO": "EQ04541",
        "NameOfPerson": "JOHN DOE",
        "RelationshipToBuilding": "SUPER",
        "DescriptionOfPerson": "Building Superintendent",
        "Signature": "J. DOE",
        "TypeOrPrintName": "JOHN DOE",
        "NotaryDay": "01",
        "NotaryMonth": "MARCH",
        "NotaryYear": "25",
    }

    input_pdf = r"G:\My Drive\HPD_OMO_PIPELINE_2025\Scripts\Locked_AFFIDAVIT OF WORK PERFORMED 12.2024 Rev. 01.21.2025.pdf"
    output_pdf = r"G:\My Drive\HPD_OMO_PIPELINE_2025\Scripts\WorkCompletedAffidavit_Filled_FINAL.pdf"

    fill_affidavit(input_pdf, sample_data, output_pdf)
