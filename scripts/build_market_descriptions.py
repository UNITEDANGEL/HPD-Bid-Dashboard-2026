"""Job descriptions from every invitation to bid you received (won or not), so the price help can
compare a new invitation with what HPD actually paid for similar work, whoever won it. Reads page 3 of
each invitation PDF (real text, no OCR) and keeps the newest invitation per OMO. Adds to
data/market_descriptions.json; scripts/update-market-awards.mjs then adds the award amounts from
NYC Open Data.

    python scripts/build_market_descriptions.py "C:/.../HPD_BIDS_FILLER/Filler_Code/Invitations" [more folders]
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fetch_upcoming_bids import job_description, omo_from_filename  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "market_descriptions.json")
MAX_CHARS = 1200


def stamp(name):
    """Invitation files end in the time received, MMDDYYhhmmss: newest wins."""
    m = re.search(r"_(\d{2})(\d{2})(\d{2})(\d{6})", os.path.basename(name))
    return f"{m.group(3)}{m.group(1)}{m.group(2)}{m.group(4)}" if m else ""


def load():
    try:
        with open(OUT, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def main(folders):
    import fitz  # PyMuPDF
    known = load()
    newest = {}
    for folder in folders:
        for dirpath, _, files in os.walk(folder):
            for name in files:
                omo = omo_from_filename(name)
                if not omo or not name.lower().endswith(".pdf"):
                    continue
                newest.setdefault(omo, []).append(os.path.join(dirpath, name))
    added = skipped = 0
    print(f"Reading {len(newest)} invitations...", flush=True)
    for i, (omo, paths) in enumerate(sorted(newest.items())):
        if i % 250 == 0:
            print(f"  {i}/{len(newest)}", flush=True)
        if known.get(omo, {}).get("description"):
            continue
        description, path = "", ""
        # Newest file first; a COA or other 2-page paper for the same OMO has no description, so try
        # the next one. The description is on page 3, or on whichever page says "Job Description:".
        for candidate in sorted(paths, key=stamp, reverse=True):
            try:
                doc = fitz.open(candidate)
                pages = [doc[2]] if len(doc) >= 3 else []
                pages += [p for p in doc if "job description" in p.get_text().lower()]
                for page in pages:
                    description = job_description(page.get_text())
                    if len(description) >= 20:
                        break
            except Exception as error:  # a damaged or online-only file: try the next one
                print(f"  could not read {candidate}: {error}")
            if len(description) >= 20:
                path = candidate
                break
        if len(description) < 20:
            skipped += 1
            continue
        known[omo] = {"description": description[:MAX_CHARS], "source": os.path.basename(path)}
        added += 1
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(dict(sorted(known.items())), f, indent=0, ensure_ascii=False)
    print(f"Market descriptions: {len(known)} OMOs ({added} added, {skipped} unreadable) from {len(newest)} invitations")


if __name__ == "__main__":
    main(sys.argv[1:])
