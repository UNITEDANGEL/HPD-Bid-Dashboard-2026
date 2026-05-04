import fitz  # PyMuPDF
import json
import os
from datetime import datetime

# ----------------------------------------------------------
# CONFIGURATION
# ----------------------------------------------------------
TEMPLATE_PATH = r"G:\My Drive\HPD_Bid_Management_Project\Templates\INVOICE PDF ORIGINAL.pdf"
DATA_FOLDER = r"G:\My Drive\HPD_Bid_Management_Project\Invoice_Filler_Only_Project\Data"
OUTPUT_FOLDER = r"G:\My Drive\HPD_Bid_Management_Project\Invoice_Filler_Only_Project\PDFs\Generated"

# ----------------------------------------------------------
# MAIN FUNCTION
# ----------------------------------------------------------
def fill_invoice_from_affidavit(affidavit_json_path):
    # Load affidavit data
    with open(affidavit_json_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    omo = data.get("OMO", "UNKNOWN")
    output_path = os.path.join(OUTPUT_FOLDER, f"{omo}_invoice_filled_flat.pdf")

    # Open invoice template
    doc = fitz.open(TEMPLATE_PATH)
    page = doc[0]

    # ------------------------------------------------------
    # MAP JSON → PDF FIELD NAMES
    # ------------------------------------------------------
    field_map = {
        "OMO": data.get("OMO", ""),
        "OMO  Invoice": f"{data.get('OMO', '')}-INVOICE",
        "TRADE": data.get("Trade", "GENERAL CONSTRUCTION"),
        "ADDRESS": data.get("Building_Address", ""),
        "BORO": data.get("Borough", ""),  # Text box version (no dropdown)
        "Work LocationApt": data.get("Apt_No", ""),
        "DESCRIPTION OF WORK DONE": data.get("Description", ""),
        "NAME Please Print": "RUPINDERJIT KAUR",
        "TITLE": "OWNER",
        "TAX _ID": "11-2233445",
        "INVOICE DATE": datetime.now().strftime("%m/%d/%Y"),
        "BOROUGH Date Work Started": data.get("Start_Date", ""),
        "Date Work Completed": data.get("Completion_Date", ""),
        "Bid AmouQt 2": data.get("Award_Amount", ""),
        "Bid Amout 1": data.get("Award_Amount", ""),
        "TOTAL CHARGE": data.get("Award_Amount", "")
    }

    # Fill material/quantity lines (1–24)
    material_list = data.get("Material_List", [])
    for i in range(1, 25):
        field_map[str(i)] = material_list[i - 1] if i <= len(material_list) else f"Item {i} - N/A"

    # Fill checkboxes
    for i in range(4, 10):
        field_map[f"Check Box{i}"] = "Yes"

    # ------------------------------------------------------
    # FILL FORM FIELDS USING PyMuPDF (VISIBLE + FLATTEN)
    # ------------------------------------------------------
    for widget in page.widgets():
        name = widget.field_name
        if name in field_map:
            widget.field_value = field_map[name]
            widget.update()

    # Save flattened visible PDF
    os.makedirs(OUTPUT_FOLDER, exist_ok=True)
    doc.save(output_path, incremental=False)

    print(f"✅ Invoice filled successfully for {omo}")
    print(f"📄 Saved → {output_path}")
    print(f"📘 Template used: {TEMPLATE_PATH}")
    print(f"📗 Data loaded from: {affidavit_json_path}")

# ----------------------------------------------------------
# ENTRY POINT
# ----------------------------------------------------------
if __name__ == "__main__":
    # Example JSON file
    json_filename = "EP28343_affidavit.json"
    json_path = os.path.join(DATA_FOLDER, json_filename)
    fill_invoice_from_affidavit(json_path)
