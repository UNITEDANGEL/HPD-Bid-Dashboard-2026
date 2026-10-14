"""Your bid price on every invitation you faxed HPD (Sent mail to HumbleFax / rcfax): the price from the file name
(app packages: "ER07717_BID_387_...") or read with OCR from page 1's "BID PRICE: $ ____" line (older packages are
flattened images). Private: writes data/private/bid_history.json (gitignored, never published). Saves as it
goes, so it can be stopped and run again; already-read emails are skipped.
"""
import argparse
import base64
import datetime
import io
import json
import os
import re
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "private", "bid_history.json")
OMO = re.compile(r"(?<![A-Za-z0-9])(E[A-Za-z]\d{5})(?!\d)")  # also "ER04466_1008...pdf": \b fails before "_"
PRICE_IN_NAME = re.compile(r"_BID_(\d+(?:\.\d{1,2})?)_", re.I)


def ocr_price(path):
    import fitz
    import pytesseract
    from PIL import Image
    with fitz.open(path) as doc:  # closed before the temporary file is deleted (Windows)
        return price_on(doc[0])


def price_on(page):
    import fitz
    import pytesseract
    from PIL import Image
    r = page.rect
    # The "BID PRICE: $ ____" line: left half of the page, about 84-87% down (form IB-1 R-3/07).
    for top, bottom in ((0.835, 0.87), (0.80, 0.90)):
        clip = fitz.Rect(r.width * 0.04, r.height * top, r.width * 0.46, r.height * bottom)
        img = Image.open(io.BytesIO(page.get_pixmap(dpi=300, clip=clip).tobytes("png")))
        text = pytesseract.image_to_string(img, config="--psm 6")
        m = re.search(r"BID\s*PRICE\s*[:;]?\s*\$?\s*([\d,]{2,9}(?:\.\d{2})?)", text, re.I)
        if m:
            value = float(m.group(1).replace(",", ""))
            if 50 <= value <= 200000:
                return value
    return None


def main(since):
    sys.path.insert(0, ROOT)
    from FetchrMatcherV5 import get_gmail_service
    service = get_gmail_service()
    try:
        with open(OUT, encoding="utf-8") as f:
            store = json.load(f)
    except (OSError, ValueError):
        store = {"emails": {}, "bids": {}}
    query = f"in:sent to:(rcfax.com OR humblefax.com) has:attachment after:{since}"
    ids, token = [], None
    while True:
        resp = service.users().messages().list(userId="me", q=query, maxResults=500, pageToken=token).execute(num_retries=3)
        ids += [m["id"] for m in resp.get("messages", [])]
        token = resp.get("nextPageToken")
        if not token:
            break
    todo = [i for i in ids if i not in store["emails"]]
    print(f"{len(ids)} bid fax emails since {since}; {len(todo)} not read yet", flush=True)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)

    def save():
        with open(OUT, "w", encoding="utf-8") as f:
            json.dump(store, f)

    for n, mid in enumerate(todo, 1):
        msg = service.users().messages().get(userId="me", id=mid).execute(num_retries=3)
        sent_at = int(msg.get("internalDate", 0))
        headers = {h["name"].lower(): h["value"] for h in msg.get("payload", {}).get("headers", [])}
        found = []
        stack = [msg.get("payload", {})]
        while stack:
            p = stack.pop()
            stack += p.get("parts", []) or []
            name = p.get("filename") or ""
            att = (p.get("body") or {}).get("attachmentId")
            if not name.lower().endswith(".pdf") or not att:
                continue
            m = OMO.search(name)
            if not m:
                continue
            omo = m.group(1).upper()
            price, how = None, ""
            pm = PRICE_IN_NAME.search(name)
            if pm:
                price, how = float(pm.group(1)), "name"
            else:
                raw = service.users().messages().attachments().get(userId="me", messageId=mid, id=att).execute(num_retries=3)
                with tempfile.TemporaryDirectory() as tmp:
                    path = os.path.join(tmp, "bid.pdf")
                    with open(path, "wb") as f:
                        f.write(base64.urlsafe_b64decode(raw["data"]))
                    try:
                        price, how = ocr_price(path), "ocr"
                    except Exception as error:  # a damaged PDF: recorded, not fatal
                        how = f"error: {error}"[:80]
            found.append({"omo": omo, "price": price, "how": how, "file": name[:120]})
            entry = {"price": price, "sentAt": sent_at, "how": how, "revised": "revis" in (headers.get("subject", "") + name).lower()}
            sends = store["bids"].setdefault(omo, [])
            if entry not in sends:
                sends.append(entry)
                sends.sort(key=lambda e: e["sentAt"])
        store["emails"][mid] = {"sentAt": sent_at, "found": len(found)}
        if n % 25 == 0:
            save()
            read = sum(1 for v in store["bids"].values() for e in v if e["price"])
            print(f"  {n}/{len(todo)} emails · {len(store['bids'])} OMOs · {read} prices read", flush=True)
    save()
    priced = {o: v for o, v in store["bids"].items() if any(e["price"] for e in v)}
    print(f"Bid history: {len(store['bids'])} OMOs bid, {len(priced)} with the price read, from {len(ids)} emails since {since}")


if __name__ == "__main__":
    a = argparse.ArgumentParser()
    a.add_argument("--since", default="2025/11/01")
    main(a.parse_args().since)
