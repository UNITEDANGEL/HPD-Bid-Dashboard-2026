#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Fill HPD Invoice + Affidavits (Work Performed / No Work Performed) from a single data JSON.

- Deterministic per-widget traversal (no stale refs): page.first_widget -> w.next
- 11 line-item rows (odd numeric fields = descriptions; even numeric fields = quantities)
- Invoice checkbox pairs handled (RC/Mini RC, Permit Required, Approved Increase/Decrease)
- Attaches the filled invoice to each affidavit if requested
- Renders PNG previews for quick visual checks

Requires: pip install pymupdf
"""

import argparse
import json
from pathlib import Path
import re
import datetime
import fitz  # PyMuPDF


# ----------------------- Helpers -----------------------

def text_set(w, val: str):
    try:
        w.field_value = val
        w.update()
    except Exception:
        pass


def checkbox_set(w, checked: bool):
    try:
        w.field_value = "Yes" if checked else "Off"
        w.update()
    except Exception:
        pass


def traverse_widgets(page):
    """Safe iteration over widgets (avoids weakref invalidation)."""
    w = page.first_widget
    while w:
        yield w
        w = w.next


def fill_pdf_fields(src_pdf: Path, setter_fn, out_name: str | None = None):
    """Open a PDF, call setter_fn(widget) for each widget, save to 'filled_*.pdf'."""
    doc = fitz.open(str(src_pdf))
    for i in range(len(doc)):
        for w in traverse_widgets(doc[i]):
            setter_fn(w)

    # Improve visual rendering of filled values when viewed/exported
    try:
        doc.set_need_appearances(True)
    except Exception:
        pass

    out_pdf = src_pdf.with_name(out_name) if out_name else src_pdf.with_name(f"filled_{src_pdf.name}")
    doc.save(str(out_pdf))
    doc.close()
    return out_pdf


def append_pdf(base_pdf: Path, append_pdf_path: Path, out_name: str):
    A = fitz.open(str(base_pdf))
    B = fitz.open(str(append_pdf_path))
    A.insert_pdf(B)
    out = base_pdf.with_name(out_name)
    A.save(str(out))
    A.close()
    B.close()
    return out


def render_pdf_to_pngs(pdf_path: Path, out_dir: Path, prefix: str, scale=2, max_pages=2):
    out_dir.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(str(pdf_path))
    imgs = []
    for i in range(min(len(doc), max_pages)):
        pix = doc[i].get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
        out_png = out_dir / f"{prefix}_p{i+1}.png"
        pix.save(str(out_png))
        imgs.append(out_png)
    doc.close()
    return imgs


# ----------------------- Invoice fill -----------------------

def make_invoice_setter(data: dict, invoice_mapping: dict | None):
    case = data["case"]
    dates = data["dates"]
    inv = data["invoice"]

    # Build 11 rows (desc, qty). Pad if fewer.
    rows = [(li["description"], li["quantity"]) for li in inv.get("line_items", [])]
    while len(rows) < 11:
        idx = len(rows) + 1
        rows.append((f"Material {idx}", "1"))
    rows = rows[:11]

    # Optional explicit mapping file (not required to run)
    explicit_text = {}
    checkbox_pairs = {}
    qty_fields_order = []
    if invoice_mapping:
        explicit_text = invoice_mapping.get("text", {})
        checkbox_pairs = invoice_mapping.get("checkboxes", {})
        qty_fields_order = invoice_mapping.get("quantity_fields_order", [])

    # Pre-compute a multi-line summary (used only if your template has a large text area)
    desc_lines = [f"{d}    {q}" for d, q in rows]
    multi_desc = "\n".join(desc_lines)

    def setter(w):
        name = (w.field_name or "").strip()
        lname = name.lower()
        ftype = getattr(w, "field_type_string", "Text")
        ### MTQNT_PATCH_V1 ###
        mt = re.fullmatch(r"MT(\d+)", name, re.IGNORECASE)
        if mt:
            i = int(mt.group(1))
            inv_materials = inv.get("materials", None)
            materials = []
            if isinstance(inv_materials, list) and inv_materials:
                if all(isinstance(x, str) for x in inv_materials):
                    materials = [str(x).strip() for x in inv_materials if str(x).strip()]
                else:
                    for x in inv_materials:
                        if isinstance(x, dict) and str(x.get("name","")).strip():
                            materials.append(str(x.get("name")).strip())
            if not materials:
                desc = (inv.get("work_description") or "")
                d = desc.lower()
                rules = [
                    (r"door\s+closer|closer", "Door Closer"),
                    (r"hinge", "Door Hinge"),
                    (r"lock|deadbolt|cylinder", "Lock / Cylinder"),
                    (r"knob|lever", "Door Knob / Lever"),
                    (r"paint|prime|primer", "Paint / Primer"),
                    (r"drywall|sheetrock", "Drywall"),
                    (r"joint\s+compound|compound|mud", "Joint Compound"),
                    (r"screw|screws|fastener", "Screws / Fasteners"),
                    (r"bolt|bolts|nut|washer", "Hardware"),
                    (r"adjust|adjustment|align|alignment", "Labor Adjustment"),
                    (r"install|installation", "Installation Labor"),
                    (r"remove|removal", "Removal Labor"),
                    (r"repair", "Repair Materials"),
                ]
                for pat, label in rules:
                    if re.search(pat, d) and label not in materials:
                        materials.append(label)
                if not materials:
                    materials = ["Materials (See Description)"]
            def _title(x: str) -> str:
                x = re.sub(r"\s+", " ", (x or "").strip())
                return " ".join(w[:1].upper() + w[1:].lower() if w else w for w in x.split(" "))
            materials = [_title(x) for x in materials][:12]
            val = materials[i-1] if 1 <= i <= 12 and (i-1) < len(materials) else ""
            text_set(w, val)
            return
        qn = re.fullmatch(r"QNT(\d+)", name, re.IGNORECASE)
        if qn:
            text_set(w, "")
            return


        if ftype == "CheckBox":
            # Known pairs: (YesField, NoField) -> desired boolean
            pairs = {
                ("Check Box8", "Check Box9"): bool(inv["checks"].get("rc_mini_rc", False)),
                ("Check Box5", "Check Box4"): bool(inv["checks"].get("permit_required", False)),
                ("Check Box7", "Check Box6"): bool(inv["checks"].get("approved_increase_decrease", False)),
            }
            # If additional explicit mapping provided, merge/override
            # Format in mapping: "FieldName": "invoice.checks.rc_mini_rc:yes" / ":no"
            for yes_name, mapping in checkbox_pairs.items():
                # This format is often 1:1 fields; pairs above already cover typical cases
                pass

            for (yes_field, no_field), desired in pairs.items():
                if name == yes_field:
                    checkbox_set(w, desired)
                    return
                if name == no_field:
                    checkbox_set(w, not desired)
                    return
            # default ON so checkbox locations are visible
            checkbox_set(w, True)
            return

        # Text widgets
        v = None

        # 1) Exact field names we know (ground truth)
        exact = {
            "OMO  Invoice": case["invoice_number"],
            "TAX _ID": inv["tax_id"],
            "INVOICE DATE": dates["work_completed"],
            "TRADE": inv["trade"],
            "BORO": case["borough"],
            "ADDRESS": case["building_address"],
            "Work LocationApt": inv.get("work_location_or_apt", "Apt 1A"),
            "BOROUGH Date Work Started": dates["work_started"],
            "Date Work Completed": dates["work_completed"],
            "DESCRIPTION OF WORK DONE": inv["work_description"],
            "Bid Amout 1": inv["amounts"]["bid_amount"],
            "Bid AmouQt 2": inv["amounts"]["approved_increase_decrease"],
            "TOTAL CHARGE": inv["amounts"]["total_charge"],
            "NAME Please Print": inv["signature"]["name_print"],
            "TITLE": inv["signature"]["title"],
            # If your template exposes a big text area (e.g. "23"), you can choose to use it:
            "23": "",  # leave empty since we are filling the grid explicitly
        }
        if name in exact:
            text_set(w, exact[name])
            return

        # If you have an explicit JSON map of field->source, prefer it (optional)
        if explicit_text and name in explicit_text:
            # Just a safety: dotted keys aren't dereferenced here (we already mapped above),
            # but if you want, you can add a small resolver. For now, we skip.
            pass

        # 2) Numeric grid 1..22 (odd = desc, even = qty)
        if name.isdigit():
            try:
                n = int(name)
                if 1 <= n <= 22:
                    row = (n - 1) // 2
                    v = rows[row][0] if (n % 2 == 1) else rows[row][1]
                    text_set(w, v)
                    return
            except Exception:
                pass

        # 3) Heuristic fallback (in case the template changes a label)
        if "invoice" in lname and "date" not in lname:
            v = case["invoice_number"]
        elif "tax" in lname:
            v = inv["tax_id"]
        elif "trade" in lname:
            v = inv["trade"]
        elif "boro" in lname or "borough" in lname:
            v = case["borough"]
        elif "address" in lname or "building" in lname:
            v = case["building_address"]
        elif ("work" in lname and "start" in lname) or ("start" in lname and "date" in lname):
            v = dates["work_started"]
        elif ("work" in lname and "complete" in lname) or ("completed" in lname and "date" in lname):
            v = dates["work_completed"]
        elif "description" in lname:
            v = inv["work_description"]
        elif ("bid" in lname and "amount" in lname) or "bid amount" in lname:
            v = inv["amounts"]["bid_amount"]
        elif "total" in lname and "charge" in lname:
            v = inv["amounts"]["total_charge"]
        elif "increase" in lname or "decrease" in lname:
            v = inv["amounts"]["approved_increase_decrease"]
        elif "name" in lname and "print" in lname:
            v = inv["signature"]["name_print"]
        elif lname == "title":
            v = inv["signature"]["title"]
        elif "tel" in lname or "phone" in lname:
            v = data["parties"]["contact_phone"]
        elif "email" in lname:
            v = data["parties"]["contact_email"]
        elif "signature" in lname:
            v = "Signed electronically"

        # 4) Final safety: nothing blank
        if v is None or v == "":
            v = "Sample"
        text_set(w, v)

    return setter


# ----------------------- Affidavits fill -----------------------

def make_work_affidavit_setter(data: dict):
    case = data["case"]
    dates = data["dates"]
    awp = data["affidavit_work_performed"]

    def setter(w):
        name = (w.field_name or "").strip()
        lname = name.lower()
        ftype = getattr(w, "field_type_string", "Text")

        if ftype == "CheckBox":
            # Turn on the main path for visibility; refine if you add explicit checkbox mapping later
            checkbox_set(w, bool(awp.get("all_work", {}).get("performed", True)))
            return

        v = None
        if "omo" in lname:
            v = case["omo_number"]
        elif "county" in lname:
            v = case["borough"]  # substitute if you store county separately
        elif "state" in lname:
            v = "New York"
        elif "building" in lname or "address" in lname:
            v = case["building_address"]
        elif "beginning" in lname or ("start" in lname and "date" in lname):
            v = awp.get("all_work", {}).get("start_date", "")
        elif "completed" in lname or ("end" in lname and "date" in lname):
            v = awp.get("all_work", {}).get("end_date", "")
        elif "directed" in lname and "date" in lname:
            v = dates["date_directed_by_hpd"]
        elif "partial" in lname and "reason" in lname:
            v = awp.get("partial_work", {}).get("reason", "")
        elif "partial" in lname and ("amount" in lname or "$" in lname):
            v = awp.get("partial_work", {}).get("amount", "")
        elif "interrupted" in lname and "reason" in lname:
            v = awp.get("interrupted", {}).get("reason", "")
        elif "interrupted" in lname and ("amount" in lname or "$" in lname):
            v = awp.get("interrupted", {}).get("amount", "")
        elif "stated his/her name" in lname or "stated his her name" in lname:
            v = awp.get("interrupted", {}).get("prevented_person", {}).get("name", "")
        elif "relationship" in lname:
            v = awp.get("interrupted", {}).get("prevented_person", {}).get("relationship", "")
        elif "description of individual" in lname:
            v = awp.get("interrupted", {}).get("prevented_person", {}).get("description", "")
        elif "type or print name" in lname or "print name" in lname:
            v = awp.get("signature", {}).get("type_or_print_name", "")
        elif "signature" in lname:
            v = "Signed electronically"
        elif re.fullmatch(r"sworn.*day", lname):
            v = dates["affidavit_sworn_day"]
        elif re.fullmatch(r"sworn.*month", lname):
            v = dates["affidavit_sworn_month"]
        elif "20__" in name or "20__" in lname or "year" in lname:
            v = dates["affidavit_sworn_year_2digits"]

        if v is None or v == "":
            v = "Sample"
        text_set(w, v)

    return setter


def make_no_work_affidavit_setter(data: dict):
    case = data["case"]
    dates = data["dates"]
    anw = data["affidavit_no_work_performed"]

    def setter(w):
        name = (w.field_name or "").strip()
        lname = name.lower()
        ftype = getattr(w, "field_type_string", "Text")

        if ftype == "CheckBox":
            # default ON for visibility unless you wire explicit mapping
            checkbox_set(w, True)
            return

        v = None
        if "omo#" in lname or "omo" in lname:
            v = case["omo_number"]
        elif "county" in lname:
            v = case["borough"]
        elif "building" in lname or "address" in lname:
            v = case["building_address"]
        elif "service charge" in lname or "charge" in lname or "$" in lname:
            v = anw.get("service_charge", "")
        elif "physically inaccessible" in lname or "inaccessibility" in lname:
            if "line1" in lname:
                v = anw.get("reasons", {}).get("physically_inaccessible", {}).get("details_line1", "")
            elif "line2" in lname:
                v = anw.get("reasons", {}).get("physically_inaccessible", {}).get("details_line2", "")
        elif "completed by others" in lname and "date" in lname:
            v = anw.get("reasons", {}).get("completed_by_others", {}).get("visit_date", "")
        elif "being performed by others" in lname and "date" in lname:
            v = anw.get("reasons", {}).get("being_performed_by_others", {}).get("visit_date", "")
        elif "name as" in lname and "performing work" in lname:
            v = anw.get("reasons", {}).get("being_performed_by_others", {}).get("other_contractor_name", "")
        elif "denied access" in lname and "date" in lname:
            v = anw.get("reasons", {}).get("denied_access", {}).get("visit_date", "")
        elif "stated his/her name" in lname:
            v = anw.get("reasons", {}).get("denied_access", {}).get("prevented_person", {}).get("name", "")
        elif "relationship to building" in lname or "relationship to\nbuilding" in lname:
            v = anw.get("reasons", {}).get("denied_access", {}).get("prevented_person", {}).get("relationship", "")
        elif "description of individual" in lname:
            v = anw.get("reasons", {}).get("denied_access", {}).get("prevented_person", {}).get("description", "")
        elif "telephone" in lname:
            v = anw.get("reasons", {}).get("denied_access", {}).get("prevented_person", {}).get("phone", "")
        elif "two attempts" in lname and "gain access" in lname:
            v = f"Attempts: {anw.get('reasons',{}).get('access_attempts',{}).get('attempt_date_1','')} and {anw.get('reasons',{}).get('access_attempts',{}).get('attempt_date_2','')}"
        elif "attempted to contact the tenant by telephone on" in lname:
            v = f"{anw.get('reasons',{}).get('access_attempts',{}).get('phone_attempt_date_1','')} and {anw.get('reasons',{}).get('access_attempts',{}).get('phone_attempt_date_2','')}"
        elif "type or print name" in lname or "print name" in lname:
            v = anw.get("signature", {}).get("type_or_print_name", "")
        elif "signature" in lname:
            v = "Signed electronically"
        elif re.fullmatch(r"sworn.*day", lname):
            v = dates["affidavit_sworn_day"]
        elif re.fullmatch(r"sworn.*month", lname):
            v = dates["affidavit_sworn_month"]
        elif "20__" in name or "20__" in lname or "year" in lname:
            v = dates["affidavit_sworn_year_2digits"]

        if v is None or v == "":
            v = "Sample"
        text_set(w, v)

    return setter


# ----------------------- Main -----------------------

def main():
    ap = argparse.ArgumentParser(description="Fill Invoice + Affidavits from JSON")
    ap.add_argument("--data", required=True, help="Path to work-order data JSON")
    ap.add_argument("--config", required=True, help="Path to project_config.json")
    ap.add_argument("--outdir", default="output", help="Directory for preview PNGs")
    ap.add_argument("--attach-invoice", action="store_true", help="Append invoice to affidavits")
    args = ap.parse_args()

    data = json.load(open(args.data, "r"))
    cfg = json.load(open(args.config, "r"))
    outdir = Path(args.outdir); outdir.mkdir(parents=True, exist_ok=True)

    ### TIMESTAMP_OUTPUTS_V1 ###
    omo_for_tag = data.get('case', {}).get('omo_number', 'RUN')
    ts = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
    run_tag = f"{omo_for_tag}__{ts}"


    # Templates
    inv_template = Path(cfg["templates"]["invoice"])
    work_template = Path(cfg["templates"]["affidavit_work_performed"])
    no_work_template = Path(cfg["templates"]["affidavit_no_work_performed"])

    # Optional invoice mapping
    invoice_mapping = None
    try:
        invoice_mapping = json.load(open(Path(cfg.get("invoice_mapping_path", "/mnt/data/invoice_field_mapping.json")), "r"))
    except Exception:
        pass

    # ---- Fill invoice
    invoice_setter = make_invoice_setter(data, invoice_mapping)
    filled_invoice = fill_pdf_fields(inv_template, invoice_setter, out_name=f"filled_{inv_template.name}__{run_tag}.pdf")

    # ---- Fill affidavits
    work_setter = make_work_affidavit_setter(data)
    no_work_setter = make_no_work_affidavit_setter(data)

    filled_work = fill_pdf_fields(work_template, work_setter, out_name=f"filled_{work_template.name}__{run_tag}.pdf")
    filled_no_work = fill_pdf_fields(no_work_template, no_work_setter, out_name=f"filled_{no_work_template.name}__{run_tag}.pdf")

    # ---- Attach invoice to affidavits (if requested)
    attach_flag = args.attach_invoice or data.get("generate", {}).get("attach_invoice_with_affidavits", True)
    work_out = append_pdf(filled_work, filled_invoice, f"work_affidavit_PLUS_invoice__{run_tag}.pdf") if attach_flag else filled_work
    no_work_out = append_pdf(filled_no_work, filled_invoice, f"no_work_affidavit_PLUS_invoice__{run_tag}.pdf") if attach_flag else filled_no_work

    # ---- Previews
    render_pdf_to_pngs(filled_invoice, outdir, "invoice_preview", max_pages=1)
    render_pdf_to_pngs(work_out, outdir, "work_affidavit_preview", max_pages=2)
    render_pdf_to_pngs(no_work_out, outdir, "no_work_affidavit_preview", max_pages=2)

    print("Done. Outputs:")
    print(" -", filled_invoice)
    print(" -", work_out)
    print(" -", no_work_out)
    print("Previews written to:", outdir)


if __name__ == "__main__":
    main()

# === NEW WORK AFFIDAVIT SETTER (APPENDED) ===
def make_work_affidavit_setter(data: dict):
    """
    Fill the 'AFFIDAVIT OF WORK PERFORMED' (work completed) using the rules we defined:

    - Affiant line: "I Jotjagraj Singh / United Angel Construction Corp"
    - County always 'Queens'
    - OMO # from case["omo_number"]
    - Building address + (Location: unit or Public Area)
    - "That on [date]" and "date directed by HPD" = work start date (CSV)
    - "Beginning on" = work start date, "completed on" = work completed date
    - Notary date uses invoice date (dates["invoice_date"])
    - Signature blank (unsigned version); printed name + title filled.
    """

    case = data["case"]
    dates = data.get("dates", {})
    awp = data.get("affidavit_work_performed", {})

    omo_number = case.get("omo_number", "")
    building_address = case.get("building_address", "")
    borough = case.get("borough", "")
    loc = data.get("location", {})
    unit = loc.get("apartment_or_unit") or loc.get("unit") or ""

    # Full address + location suffix
    if unit:
        full_location = f"{building_address} (Location: {unit})"
    else:
        full_location = f"{building_address} (Location: Public Area)"

    # Dates
    work_start = awp.get("all_work", {}).get("start_date") or dates.get("work_started", "")
    work_end   = awp.get("all_work", {}).get("end_date")   or dates.get("work_completed", "")

    # Date directed by HPD = work_start (per your rule)
    date_directed_by_hpd = work_start

    # Notary date: based on invoice date
    invoice_date = dates.get("invoice_date", "")
    inv_day = ""
    inv_month_name = ""
    inv_year_2 = ""
    if invoice_date:
        parts = invoice_date.split("/")
        if len(parts) == 3:
            mm, dd, yyyy = parts
            inv_day = dd.lstrip("0") or dd
            month_names = {
                "01": "January", "1": "January",
                "02": "February", "2": "February",
                "03": "March", "3": "March",
                "04": "April", "4": "April",
                "05": "May", "5": "May",
                "06": "June", "6": "June",
                "07": "July", "7": "July",
                "08": "August", "8": "August",
                "09": "September", "9": "September",
                "10": "October",
                "11": "November",
                "12": "December",
            }
            inv_month_name = month_names.get(mm, mm)
            inv_year_2 = (yyyy[-2:] if len(yyyy) >= 2 else yyyy)

    affiant_text = "I Jotjagraj Singh / United Angel Construction Corp"

    def setter(w):
        name = (w.field_name or "").strip()
        lname = name.lower()
        ftype = getattr(w, "field_type_string", "Text")

        # Leave checkboxes alone for now to avoid flipping wrong ones.
        if ftype == "CheckBox":
            return

        v = None

        # Affiant line
        if "deposes and says" in lname or ("affiant" in lname):
            v = affiant_text

        # OMO number
        elif "omo" in lname and "#" in lname:
            v = omo_number

        # County
        elif "county" in lname:
            v = "Queens"

        # Building address + location
        elif "building" in lname or "address" in lname:
            v = full_location

        # "That on [date] I was directed by HPD..."
        elif "that on" in lname and "directed by hpd" in lname:
            v = work_start or date_directed_by_hpd

        # Date directed by HPD (if separate field)
        elif "date" in lname and "directed" in lname:
            v = date_directed_by_hpd

        # "Beginning on" (work start date)
        elif "beginning on" in lname or ("beginning" in lname and "date" in lname):
            v = work_start

        # "Completed on" (work completed date)
        elif "completed on" in lname or ("completed" in lname and "date" in lname):
            v = work_end

        # Notary lines
        elif "sworn" in lname and "day" in lname:
            v = inv_day
        elif "sworn" in lname and "month" in lname:
            v = inv_month_name
        elif "20" in name and "__" in name or ("year" in lname):
            if inv_year_2:
                # Your preferred format: "20 25"
                v = f"20 {inv_year_2}"

        # Signature block
        elif "type or print name" in lname or "print name" in lname:
            v = "Jotjagraj Singh"
        elif lname == "title":
            v = "President"
        elif "signature" in lname:
            # UNSIGNED version: leave blank. Signed version handled separately.
            v = ""

        # Other widgets: leave blank to avoid random text in legal document
        if v is None:
            return
        text_set(w, v)

    return setter
# === END NEW WORK AFFIDAVIT SETTER ===


