"""Which boxes HPD marked on the paperwork they sent back (owner, 9 Nov: "I should see the thing I need to fix,
especially if a PDF is attached and marked").

HPD prints our affidavit / invoice, marks the wrong or empty boxes with a yellow highlighter and red pen
(circles, "?"), scans it and emails it back. The scan has no text, so: find the yellow / red marks by color,
read the printed form with OCR (tesseract, free, on this computer), and name the box each mark sits on, e.g.
"Invoice date", "Total charge", "Line 2 date (directed by HPD)". Only box names come out; nothing written in
the boxes (addresses, names) is kept.

    from hpd_marks import read_marks          # read_marks(pdf_bytes) -> ["Invoice #", "Invoice date", ...]
    python scripts/hpd_marks.py file.pdf ...  # prints what it finds (for checking)
"""
import re
import sys

BOROUGHS = re.compile(r"^(BRON|BROOK|QUEEN|MANH|STATEN)", re.I)
DATE = re.compile(r"\d{1,2}/\d{1,2}/\d{2,4}")
MIN_AREA = 500  # px² at 150 dpi; smaller color specks are scanner noise


def _pix_rgb(page, dpi=150):
    import numpy as np
    pix = page.get_pixmap(dpi=dpi, alpha=False)
    return np.frombuffer(pix.samples, np.uint8).reshape(pix.h, pix.w, 3)


def _components(mask, cell=6):
    """Bounding boxes of the color blobs (grid flood fill; no scipy needed)."""
    import numpy as np
    h, w = mask.shape
    gh, gw = h // cell, w // cell
    g = mask[: gh * cell, : gw * cell].reshape(gh, cell, gw, cell).sum(axis=(1, 3)) >= 3
    # Close small gaps in a pen stroke.
    pad = np.zeros((gh + 2, gw + 2), bool)
    pad[1:-1, 1:-1] = g
    grown = g.copy()
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            grown |= pad[1 + dy: gh + 1 + dy, 1 + dx: gw + 1 + dx]
    seen = np.zeros_like(grown)
    out = []
    for y in range(gh):
        for x in range(gw):
            if not grown[y, x] or seen[y, x]:
                continue
            stack, cells = [(y, x)], []
            seen[y, x] = True
            while stack:
                cy, cx = stack.pop()
                cells.append((cy, cx))
                for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                    if 0 <= ny < gh and 0 <= nx < gw and grown[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        stack.append((ny, nx))
            ys = [c[0] for c in cells]
            xs = [c[1] for c in cells]
            box = (min(xs) * cell, min(ys) * cell, (max(xs) + 1) * cell, (max(ys) + 1) * cell)
            if (box[2] - box[0]) * (box[3] - box[1]) >= MIN_AREA and len(cells) >= 4:
                out.append(box)
    return out


def find_marks(rgb):
    """Yellow highlighter and red pen marks: [(kind, x0, y0, x1, y1)]."""
    import numpy as np
    a = rgb.astype(int)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx, mn = a.max(-1), a.min(-1)
    sat = (mx - mn) / np.maximum(mx, 1)
    yellow = (r > 170) & (g > 165) & (b < 150) & (sat > 0.28)
    red = (r > 140) & (g < 115) & (b < 125) & (sat > 0.38)
    # Red pen marks are circles and "?" (big); small red specks are scanner noise or a tick.
    reds = [bx for bx in _components(red) if (bx[2] - bx[0]) * (bx[3] - bx[1]) >= 1500]
    return [("yellow",) + bx for bx in _components(yellow)] + [("red",) + bx for bx in reds]


def ocr_words(rgb):
    from PIL import Image
    import pytesseract
    # The red channel only: yellow highlighter and red pen both turn white there, black print stays.
    d = pytesseract.image_to_data(Image.fromarray(rgb[..., 0].copy()), output_type=pytesseract.Output.DICT, config="--psm 3")
    words = []
    for i, t in enumerate(d["text"]):
        t = (t or "").strip()
        if not t:
            continue
        words.append({"t": t, "l": t.lower(), "x0": d["left"][i], "y0": d["top"][i],
                      "x1": d["left"][i] + d["width"][i], "y1": d["top"][i] + d["height"][i],
                      "line": (d["block_num"][i], d["par_num"][i], d["line_num"][i])})
    return words


def form_of(words):
    text = " ".join(w["l"] for w in words)
    if "no work performed" in text:
        return "no-work affidavit"
    if "work performed affidavit" in text or "duly sworn" in text:
        return "work affidavit"
    if "sworn to before me" in text or "notary public" in text:
        return "notary page"
    if "material" in text and ("invoice" in text or "bid amount" in text or "total charge" in text):
        return "invoice"
    return "page"


# Anchor words: a box's printed label. (word regex, the next word regex or None, box name). Checked in order.
INVOICE = [
    (r"^omo", None, "OMO #"),
    (r"^rc/mini|^rc/", None, "RC / Mini RC"),
    (r"^trade", None, "Trade"),
    (r"^borough", None, "Borough"),
    (r"^building$", r"^address", "Building address"),
    (r"^location", None, "Work location / Apt."),
    (r"^tax$", r"^id", "Tax ID #"),
    (r"^invoice$", r"^date", "Invoice date"),
    (r"^invoice$", None, "Invoice #"),
    (r"^started", None, "Date work started"),
    (r"^completed", None, "Date work completed"),
    (r"^permit", None, "Work permit"),
    (r"^bid$", r"^amount", "Bid amount"),
    (r"^total$", r"^charge", "Total charge"),
    (r"^charges?", None, "Total charge"),
    (r"^signature$", None, "Signature"),
    (r"^name$", r"^\(please", "Printed name"),
    (r"^title", None, "Title"),
]
AFFIDAVIT = [
    (r"^omo#?", None, "OMO #"),
    (r"^county$", None, "County"),
    (r"^name$", r"^of", "Name of contractor"),
    (r"^that$", r"^on", "Line 2 date (directed by HPD)"),
    (r"^that.?on$", None, "Line 2 date (directed by HPD)"),
    (r"^directed$", None, "Line 2 date (directed by HPD)"),
    (r"^located$", None, "Building address (line 2)"),
    (r"^beginning$", None, "Work start date"),
    (r"^completed$", r"^on", "Work completion date"),
    (r"^charge$", None, "Service charge $"),
    (r"^amount$", r"^of", "Amount $"),
    (r"^access$", r"^on", "Access attempt dates"),
    (r"^telephone$", None, "Tenant phone call dates"),
    (r"^arrived$", None, "Date you arrived at the site"),
    (r"^name$", r"^as", "Name of the other contractor"),
    (r"^inaccessibility$", None, "Why it was inaccessible"),
    (r"^due$", r"^to", "Reason"),
    (r"^sworn$", None, "Your name (I, ...)"),
    (r"^signature", None, "Signature"),
    (r"^notary", None, "Notary"),
]


def _rows(words):
    rows = {}
    for w in words:
        rows.setdefault(w["line"], []).append(w)
    out = []
    for ws in rows.values():
        ws.sort(key=lambda w: w["x0"])
        out.append(ws)
    return out


def _anchors(words, table):
    found = []
    for ws in _rows(words):
        for i, w in enumerate(ws):
            nxt = ws[i + 1]["l"] if i + 1 < len(ws) else ""
            for word, after, name in table:
                if re.search(word, w["l"]) and (after is None or re.search(after, nxt)):
                    found.append({**w, "name": name})
                    break
    return found


def _overlap(a0, a1, b0, b1, pad=0):
    return min(a1, b1) + pad >= max(a0, b0)


def _name_mark(mark, words, anchors, form, width):
    _, x0, y0, x1, y1 = mark
    cx = (x0 + x1) / 2
    names = []
    # The words under the mark (a borough name or a date says which box it is on an address / date line).
    under = [w for w in words if _overlap(w["x0"], w["x1"], x0, x1) and _overlap(w["y0"], w["y1"], y0, y1)]
    if form == "invoice":
        mat = next((w for w in words if w["l"].startswith("material")), None)
        end = next((w for w in words if w["l"] == "attach" or w["l"].startswith("falsification")), None)
        qty = next((w for w in words if w["l"].startswith("quantity")), None)
        if mat and end and y0 > mat["y1"] and y1 < end["y0"] + 10:
            return ["Quantity" if qty and cx > qty["x0"] - 60 else "Materials list"]
        desc = next((w for w in words if w["l"] == "description"), None)
        if desc and mat and y0 > desc["y1"] and y1 < mat["y0"]:
            return ["Description of work"]
    # Each label row the mark crosses: the closest label to the left on that row (same column).
    for a in anchors:
        mid = (a["y0"] + a["y1"]) / 2
        band = 14 if mark[0] == "red" or form == "invoice" else 6
        if not (y0 - band <= mid <= y1 + band):
            continue
        if a["x0"] > x1 + 10:
            continue
        # A label on the other half of the page belongs to the other column.
        if (a["x0"] < width * 0.5) != (cx < width * 0.5) and form == "invoice" and a["x0"] > width * 0.45:
            continue
        right_labels = [b for b in anchors if abs(((b["y0"] + b["y1"]) / 2) - mid) < 14 and a["x0"] < b["x0"] <= cx]
        if right_labels:
            continue  # a closer label on the same row owns this mark
        names.append(a["name"])
    if under and any(BOROUGHS.match(w["t"].strip(".,_|")) for w in under):
        return ["Borough" if form == "invoice" else "Borough (line 2)"]
    if form != "invoice" and any(DATE.search(w["t"]) for w in under):
        # A date on a sentence line: the sentence says which date it is.
        row = {w["line"] for w in under if DATE.search(w["t"])}
        said = " ".join(w["l"] for w in words if w["line"] in row)
        for key, name in (("directed", "Line 2 date (directed by HPD)"), ("beginning", "Work start date"),
                          ("completed", "Work completion date"), ("access", "Access attempt dates"),
                          ("telephone", "Tenant phone call dates"), ("arrived", "Date you arrived at the site")):
            if key in said:
                return [name]
    if not names and form != "invoice":
        # The address line under "building located at" has no label of its own: use the label row just above.
        above = [a for a in anchors if a["y1"] <= y0 + 4 and y0 - a["y1"] < 60]
        if above:
            names.append(max(above, key=lambda a: a["y1"])["name"])
    return names


def read_page(page):
    rgb = _pix_rgb(page)
    marks = find_marks(rgb)
    if not marks:
        return "", []
    words = ocr_words(rgb)
    form = form_of(words)
    anchors = _anchors(words, INVOICE if form == "invoice" else AFFIDAVIT)
    names = []
    yellows = [m for m in marks if m[0] == "yellow"]
    keep = []
    for m in marks:
        if m[0] == "red":
            # A red circle / "?" drawn around a highlight: the highlight says where. Otherwise its middle part.
            if any(_overlap(m[1], m[3], y[1], y[3], 20) and _overlap(m[2], m[4], y[2], y[4], 20) for y in yellows):
                continue
            w, h = m[3] - m[1], m[4] - m[2]
            m = ("red", m[1] + w // 4, m[2] + h // 4, m[3] - w // 4, m[4] - h // 4)
        keep.append(m)
    for m in sorted(keep, key=lambda m: (m[2], m[1])):
        for n in _name_mark(m, words, anchors, form, rgb.shape[1]):
            if n not in names:
                names.append(n)
    return form, names


def read_marks(data):
    """PDF bytes -> [{"form": "invoice", "page": 3, "boxes": ["Invoice #", ...], "marks": 7}]"""
    import fitz
    out = []
    doc = fitz.open(stream=data, filetype="pdf")
    for i, page in enumerate(doc):
        if i >= 6:
            break
        form, names = read_page(page)
        if form or names:
            out.append({"form": form or "page", "page": i + 1, "boxes": names})
    return out


if __name__ == "__main__":
    for f in sys.argv[1:]:
        print(f.split("/")[-1].split("\\")[-1], read_marks(open(f, "rb").read()))
