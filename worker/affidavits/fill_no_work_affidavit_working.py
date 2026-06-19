from pdf2image import convert_from_path
from PIL import ImageDraw, ImageFont

# === Font (DejaVuSans-Bold in Scripts folder, 40 pt) ===
font_black_final = ImageFont.truetype(
    "G:/My Drive/HPD_OMO_PIPELINE_2025/Scripts/DejaVuSans-Bold.ttf", 40
)

# === Path to locked blank No Work Affidavit (always start fresh) ===
pdf_template = "G:/My Drive/HPD_OMO_PIPELINE_2025/Scripts/Locked_AFFIDAVIT OF NO WORK PERFORMED 12.2024 Rev. 01.21.2025.pdf"

# === Coordinates for Page 1 (locked & tested) ===
coords_no_work_page1 = {
    "OMO_Header": (1080, 360),
    "County": (530, 655),
    "AffiantName": (65, 870),
    "BuildingAddress": (1064, 1251),
    "OMO_Body": (2159, 1180),
    "ServiceChargeAmount": (2174, 1450),
    "InaccessibilityReason1": (420, 1838),
    "InaccessibilityReason2": (420, 1908),
    "AttemptDate1": (2122, 2044),
    "AttemptDate2": (670, 2088),
    "TelephoneDate1": (2122, 2094),
    "TelephoneDate2": (670, 2158),
    "WorkSiteVisitDate": (1153, 2295),
    "WorkSiteVisitDate2": (1153, 2493),
    "ContractorName": (1734, 2620),
}

coords_no_work_page2 = {
    "OMO_Number": (1330, 240),
    "WorksiteDate": (1133, 509),
    "DeniedPersonName": (1126, 772),
    "DeniedRelationship": (1126, 832),   # SUPER moved 20 down
    "DeniedDescription": (940, 972),     # MALE/FEMALE moved 60 right
    "DeniedPhone": (1300, 1158),
    "PrintName": (1599, 1495),           # Print Name moved up 30
    "SwornDay": (520, 1723),             # moved up 25
    "SwornMonth": (800, 1723),           # moved up 25
    "SwornYear2": (1097, 1725),          # moved up 25
    "Signature": (1602, 1297),
}


# === Static values (your company info) ===
STATIC_VALUES = {
    "County": "QUEENS",
    "AffiantName": "I,JOTJAGRAJ SINGH/UNITED ANGEL CONSTRUCTION CORP",
    "ContractorName": "JOTJAGRAJ SINGH",
    "PrintName": "JOTJAGRAJ SINGH",
    "Signature": "Signature",
}

def fill_no_work_affidavit(pdf_path, output_path, page1_data, page2_data):
    """
    Always starts from a blank affidavit PDF so no overlapping text.
    pdf_path   : path to blank affidavit
    output_path: where to save filled affidavit
    page1_data : dict values for Page 1
    page2_data : dict values for Page 2
    """

    # Merge static with dynamic data
    page1_data = {**STATIC_VALUES, **page1_data}
    page2_data = {**STATIC_VALUES, **page2_data}

    # Render both pages fresh from template
    pages = convert_from_path(pdf_path, dpi=300, first_page=1, last_page=2)
    output_imgs = []

    # Page 1
    page1 = pages[0].convert("RGB")
    draw1 = ImageDraw.Draw(page1)
    for label, (x, y) in coords_no_work_page1.items():
        draw1.text((x, y), str(page1_data.get(label, "")), fill="black", font=font_black_final)
    output_imgs.append(page1)

    # Page 2
    page2 = pages[1].convert("RGB")
    draw2 = ImageDraw.Draw(page2)
    for label, (x, y) in coords_no_work_page2.items():
        draw2.text((x, y), str(page2_data.get(label, "")), fill="black", font=font_black_final)
    output_imgs.append(page2)

    # Save combined PDF
    output_imgs[0].save(output_path, "PDF", resolution=150.0, save_all=True, append_images=[output_imgs[1]])
    return output_path


# === Example usage ===
if __name__ == "__main__":
    page1_data = {
        "OMO_Header": "EQ12345",
        "BuildingAddress": "123 MAIN ST, QUEENS, NY",
        "OMO_Body": "EQ12345",
        "ServiceChargeAmount": "$100",
        "InaccessibilityReason1": "NO ACCESS",
        "InaccessibilityReason2": "NO ACCESS",
        "AttemptDate1": "01/01/2025",
        "AttemptDate2": "01/04/2025",
        "TelephoneDate1": "01/01/2025",
        "TelephoneDate2": "01/04/2025",
        "WorkSiteVisitDate": "01/05/2025",
        "WorkSiteVisitDate2": "01/10/2025",
    }

    page2_data = {
        "OMO_Number": "EQ12345",
        "WorksiteDate": "01/12/2025",
        "DeniedPersonName": "TENANT NAME",
        "DeniedRelationship": "SUPER",
        "DeniedDescription": "MALE / SHORT / DARK HAIR",
        "DeniedPhone": "917-555-1212",
        "SwornDay": "1",
        "SwornMonth": "January",
        "SwornYear2": "25",
    }

    filled_pdf = fill_no_work_affidavit(
        pdf_template,
        "No_Work_Affidavit_Filled.pdf",
        page1_data,
        page2_data
    )
    print("✅ Saved:", filled_pdf)
