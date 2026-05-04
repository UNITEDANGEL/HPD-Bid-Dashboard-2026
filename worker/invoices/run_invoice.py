import json
import os
import sys
import datetime
from reportlab.pdfgen import canvas
from PyPDF2 import PdfReader, PdfWriter
BASE_DIR = os.path.dirname(__file__)
ROOT_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", ".."))
PUBLIC_DIR = os.path.join(ROOT_DIR, "public")
OUT_DIR = os.path.join(PUBLIC_DIR, "generated")
TEMPLATE = os.path.join(BASE_DIR, "INVOICE_TEMPLATE.pdf")
COORD_MAP = os.path.join(BASE_DIR, "invoice_field_coordinates.json")
os.makedirs(OUT_DIR, exist_ok=True)
def clean(value):
    if value is None:
        return ""
    return str(value).strip()
def first(job, *keys):
    for key in keys:
        value = job.get(key)
        if value not in (None, ""):
            return clean(value)
    return ""
def money(job):
    value = first(job, "AwardAmount", "awardAmount", "bidAmount", "amount", "TotalAmount")
    if not value:
        return ""
    if value.startswith("$"):
        return value
    return f"${value}"
def job_id(job):
    return first(job, "OMO", "omo", "id") or "JOB"
def address(job):
    return first(job, "BuildingAddress", "buildingAddress", "address", "location")
def normalize_coords(raw_coords):
    coords = {}
    if isinstance(raw_coords, list):
        for item in raw_coords:
            name = item.get("name")
            if not name:
                continue
            coords[name] = {
                "x": float(item.get("x", 0)),
                "y": float(item.get("y", 0)),
                "w": float(item.get("width", item.get("w", 0))),
                "h": float(item.get("height", item.get("h", 0))),
            }
    elif isinstance(raw_coords, dict):
        coords = raw_coords
    return coords
def create_overlay(text_map, page_width, page_height, overlay_path):
    c = canvas.Canvas(overlay_path, pagesize=(page_width, page_height))
    c.setFont("Helvetica-Bold", 8)
    for name, box in text_map.items():
        value = box.get("value", "")
        if value is None:
            value = ""
        x = float(box["x"])
        y = page_height - float(box["y"]) - float(box["h"])
        w = float(box.get("w", 0))
        h = float(box.get("h", 0))
        text_x = x + w / 2
        text_y = y + (h / 2.5)
        c.drawCentredString(text_x, text_y, str(value))
    c.save()
def burn_invoice(template_pdf, output_pdf, field_map):
    base_pdf = PdfReader(template_pdf)
    page = base_pdf.pages[0]
    page_width = float(page.mediabox.width)
    page_height = float(page.mediabox.height)
    overlay_temp = os.path.join(OUT_DIR, "_invoice_overlay_temp.pdf")
    create_overlay(field_map, page_width, page_height, overlay_temp)
    overlay_pdf = PdfReader(overlay_temp)
    writer = PdfWriter()
    page.merge_page(overlay_pdf.pages[0])
    writer.add_page(page)
    with open(output_pdf, "wb") as f_out:
        writer.write(f_out)
    try:
        os.remove(overlay_temp)
    except OSError:
        pass
def build_values(job, workflow):
    omo = job_id(job)
    today = datetime.datetime.now().strftime("%m/%d/%Y")
    return {
        "OMO": omo,
        "TAX _ID": "11-2233445",
        "OMO  Invoice": f"{omo}-INVOICE",
        "TRADE": first(job, "Trade", "trade") or "GENERAL CONSTRUCTION",
        "INVOICE DATE": today,
        "BORO": first(job, "Boro", "borough"),
        "BOROUGH Date Work Started": first(job, "WorkStartDate", "workStartDate"),
        "ADDRESS": address(job),
        "Date Work Completed": first(job, "WorkCompletionDate", "workCompletionDate"),
        "LOCATION OF WORK": first(job, "Location", "location", "ApartmentUnit", "apartment"),
        "DESCRIPTION OF WORK": first(job, "JobDescription", "description") or workflow,
        "AMOUNT OF BID": money(job),
        "TOTAL CHARGE": money(job),
        "SIGNATURE": "JOTJAGRAJ SINGH",
        "NAME": "JOTJAGRAJ SINGH",
        "TITLE": "OWNER",
    }
def main():
    payload = json.loads(sys.stdin.read())
    job = payload.get("job", {})
    workflow = payload.get("workflow", "invoice")
    with open(COORD_MAP, "r", encoding="utf-8") as f:
        coords = normalize_coords(json.load(f))
    values = build_values(job, workflow)
    text_map = {}
    for name, box in coords.items():
        text_map[name] = {
            **box,
            "value": values.get(name, ""),
        }
    omo = job_id(job).replace("/", "_").replace("\\", "_").replace(" ", "_")
    out_name = f"{omo}_INVOICE.pdf"
    out_pdf = os.path.join(OUT_DIR, out_name)
    burn_invoice(TEMPLATE, out_pdf, text_map)
    print(json.dumps({
        "ok": True,
        "url": f"/generated/{out_name}",
        "file": out_pdf
    }))
if __name__ == "__main__":
    main()
