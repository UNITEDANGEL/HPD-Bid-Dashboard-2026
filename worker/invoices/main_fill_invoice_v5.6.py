import os
import json
import datetime
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from PyPDF2 import PdfReader, PdfWriter

# === CONFIG ===
BASE_DIR = r"G:\My Drive\HPD_Bid_Management_Project\Invoice_Filler_Only_Project"
TEMPLATE = os.path.join(BASE_DIR, "PDFs", "Templates", "INVOICE_PDF_ORIGINAL.pdf")
COORD_MAP = os.path.join(BASE_DIR, "Scripts", "invoice_field_coordinates.json")
OUTPUT_DIR = os.path.join(BASE_DIR, "PDFs", "Generated")

# === HELPER: Burn text onto PDF page ===
def create_overlay(text_map, page_width, page_height, overlay_path):
    c = canvas.Canvas(overlay_path, pagesize=(page_width, page_height))
    c.setFont("Helvetica-Bold", 8)

    for field_name, field in text_map.items():
        x, y, w, h, value = field["x"], field["y"], field["w"], field["h"], field["value"]

        # Slight corrections for two key misaligned fields
        if "Bid Amout" in field_name:
            y -= 4  # move down
        if "Date Work Completed" in field_name:
            y -= 3  # move down
            x += 5  # move right

        # Draw centered text inside box
        text_x = x + w / 2
        text_y = y + (h / 2.5)
        c.drawCentredString(text_x, text_y, str(value))

    c.save()

# === MAIN PROCESS ===
def burn_invoice(template_pdf, output_pdf, field_map, values):
    base_pdf = PdfReader(template_pdf)
    page = base_pdf.pages[0]
    page_width = float(page.mediabox.width)
    page_height = float(page.mediabox.height)

    overlay_temp = os.path.join(OUTPUT_DIR, "_overlay_temp.pdf")
    create_overlay(field_map, page_width, page_height, overlay_temp)

    overlay_pdf = PdfReader(overlay_temp)
    writer = PdfWriter()

    # Merge overlay on top of invoice background
    page.merge_page(overlay_pdf.pages[0])
    writer.add_page(page)

    # Final flattened PDF
    with open(output_pdf, "wb") as f_out:
        writer.write(f_out)

    os.remove(overlay_temp)

def normalize_coords(raw_coords):
    """Normalize JSON from either list or dict into dict form"""
    coords = {}
    if isinstance(raw_coords, list):
        for item in raw_coords:
            name = item.get("name") or item.get("field_name")
            if not name:
                continue
            coords[name] = {
                "x": item.get("x", 0),
                "y": item.get("y", 0),
                "w": item.get("w", 0),
                "h": item.get("h", 0)
            }
    else:
        coords = raw_coords
    return coords


def main():
    print(f"[{datetime.datetime.now()}] 🚀 v5.6 — Restored Perfect Visual Burn + JSON Lookup + Flatten")
    with open(COORD_MAP, "r") as f:
        raw_coords = json.load(f)
        coords = normalize_coords(raw_coords)

    for omo_dir in os.listdir(os.path.join(BASE_DIR, "PDFs", "Finalized")):
        omo_path = os.path.join(BASE_DIR, "PDFs", "Finalized", omo_dir)
        if not os.path.isdir(omo_path):
            continue

        data_json_path = os.path.join(omo_path, "data.json")
        aff_json_path = os.path.join(omo_path, "affidavit", "affidavit.json")
        if not os.path.exists(data_json_path) or not os.path.exists(aff_json_path):
            continue

        with open(data_json_path, "r") as f:
            data = json.load(f)
        with open(aff_json_path, "r") as f:
            affidavit = json.load(f)

        print(f"[{datetime.datetime.now()}] --- Processing {omo_dir} ---")

        # Merge both JSON data sets
        merged = {**data, **affidavit}

        # Build value map for each field
        text_map = {}
        for name, box in coords.items():
            x, y, w, h = box["x"], box["y"], box["w"], box["h"]
            value = merged.get(name, merged.get(name.upper(), merged.get(name.lower(), "sample")))
            text_map[name] = {"x": x, "y": y, "w": w, "h": h, "value": value}

        out_pdf = os.path.join(OUTPUT_DIR, f"{omo_dir}_invoice_filled_flat.pdf")
        burn_invoice(TEMPLATE, out_pdf, text_map, merged)
        print(f"[{datetime.datetime.now()}] ✅ Invoice burned & flattened → {out_pdf}")

    print(f"[{datetime.datetime.now()}] 🏁 All OMOs processed successfully.")


if __name__ == "__main__":
    main()
