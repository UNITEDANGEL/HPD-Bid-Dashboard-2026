"""Adds HPD's notes (everything after the job description on the work page) to the invitations already
in data/upcoming_bids.json, from their PDFs in public/documents/itb. New invitations get them from
scripts/fetch_upcoming_bids.py directly.

    python scripts/backfill_bid_notes.py
"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fetch_upcoming_bids import OUT_FILES, ROOT, job_description, job_notes  # noqa: E402
from itb_text import work_text  # noqa: E402


def main():
    import fitz  # PyMuPDF
    with open(OUT_FILES[0], encoding="utf-8") as f:
        data = json.load(f)
    done = 0
    for bid in data.get("bids", []):
        path = os.path.join(ROOT, "public", "documents", "itb", bid.get("itbFile", ""))
        if not os.path.exists(path):  # kept encrypted on the site; the plain copy stays on this computer
            path = os.path.join(ROOT, "data", "private-itb", "itb", bid.get("itbFile", ""))
        if not os.path.exists(path):
            continue
        with fitz.open(path) as doc:
            work, pages = work_text([p.get_text() for p in doc])  # page 3 + continuation pages
        bid["description"] = job_description(work)[:8000] or bid.get("description", "")
        bid["notes"] = job_notes(work)[:4000]
        bid["descPages"] = pages
        done += 1
    for out in OUT_FILES:
        with open(out, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    print(f"Description (page 3 + continuation) and notes re-read for {done} invitations")


if __name__ == "__main__":
    main()
