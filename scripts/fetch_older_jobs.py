"""Jobs awarded to you before the 2026 list (2024-2025), from your Gmail: the Confirmation of Award PDF
(address, apartment / area, work dates, award date and amount) and the Invitation to Bid (job description),
with a map location. Same readers as FetchrMatcherV5 (the 2026 list).

  python scripts/fetch_older_jobs.py --rejected        the older jobs with rejected paperwork (hpd_requests.json)
  python scripts/fetch_older_jobs.py --omos EL25850,EP19269
  python scripts/fetch_older_jobs.py --since 2024/01/01 --before 2025/11/26   every award in that range

Writes data/COA_older.json and public/data/COA_older.json (no tenant names or phone numbers: the site is
public). Saves as it goes and skips OMOs already read, so it can be stopped and run again.
"""
import argparse
import base64
import json
import os
import re
import sys
import tempfile
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
import FetchrMatcherV5 as F  # noqa: E402

OUT = os.path.join(ROOT, "data", "COA_older.json")
PUBLIC = os.path.join(ROOT, "public", "data", "COA_older.json")
OMO = re.compile(r"(?<![A-Za-z0-9])(E[A-Za-z]\d{5})(?!\d)")


def load():
    try:
        with open(OUT, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def save(rows):
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(rows, f)
    public = [{k: v for k, v in r.items() if k not in ("TenantName", "TenantPhone")} for r in rows.values()]
    with open(PUBLIC, "w", encoding="utf-8") as f:
        json.dump(sorted(public, key=lambda r: r["OMO"]), f)


def first_pdf(service, query, omo):
    """The newest PDF attachment named after the OMO in the first email matching the query."""
    msgs = service.users().messages().list(userId="me", q=query, maxResults=5).execute(num_retries=3).get("messages", [])
    for m in msgs:
        msg = service.users().messages().get(userId="me", id=m["id"]).execute(num_retries=3)
        stack = [msg.get("payload", {})]
        while stack:
            part = stack.pop()
            stack += part.get("parts", []) or []
            name = part.get("filename") or ""
            att = (part.get("body") or {}).get("attachmentId")
            if att and name.lower().endswith(".pdf") and omo.upper() in name.upper():
                raw = service.users().messages().attachments().get(userId="me", messageId=m["id"], id=att).execute(num_retries=3)
                return name, base64.urlsafe_b64decode(raw["data"])
    return None, None


def clean_location(value):
    """Older award PDFs: an empty 'Location:' grabs the next line (phone / fax / procurement labels)."""
    v = (value or "").strip()
    return "" if re.search(r"\(\d{3}\)|\bfax\b|phone|procurement|specialist|awarded|work (start|completion)", v, re.I) else v


def description_from_itb(path):
    """The invitation's 'Job Description:' (page 3 in older invitations), up to HPD's standard closing."""
    text = "\n".join(F.extract_pdf_text(path))
    m = re.search(r"Job\s+Description\s*:\s*(.+)", text, re.S | re.I)
    if not m:
        return ""
    desc = re.split(r"CONTRACTOR MUST (?:CONTACT|SIGN)|VENDOR IS RESPONSIBLE FOR BIDDING|Page \d+ of \d+", m.group(1), maxsplit=1, flags=re.I)[0]
    return re.sub(r"\s+", " ", desc).strip()[:3000]


def read_job(service, omo, tmp, known=None):
    name, data = first_pdf(service, f'from:OMOBid@hpd.nyc.gov "CONFIRMATION OF AWARD" filename:{omo}', omo)
    if not data:
        return None
    path = os.path.join(tmp, f"{omo}_coa.pdf")
    with open(path, "wb") as f:
        f.write(data)
    coa = F.parse_coa_pdf(path, omo)
    coa_text = "\n".join(F.extract_pdf_text(path))
    row = {
        "OMO": omo, "COAFile": name, "BuildingAddress": coa.building_address, "Location": clean_location(coa.location),
        "ApartmentUnit": coa.apartment_unit, "WorkStartDate": coa.work_start, "WorkCompletionDate": coa.work_end,
        "AwardDate": coa.award_date or F.infer_award_date_from_filename(name), "AwardAmount": coa.award_amount, "AwardedBy": coa.awarded_by,
        "TotalSqFt": coa.total_sq_ft, "JobDescription": "", "Source": "older (2024-2025)",
    }
    iname, idata = first_pdf(service, f'from:OMOBid@hpd.nyc.gov "INVITATION TO BID" filename:{omo}', omo)
    if idata:
        ipath = os.path.join(tmp, f"{omo}_itb.pdf")
        with open(ipath, "wb") as f:
            f.write(idata)
        itb = F.parse_itb_pdf(ipath, omo)
        good = itb.job_description and not re.match(r"\s*(Page \d+ of|Confirmation\s+of\s+Award)", itb.job_description, re.I)
        desc = itb.job_description if good else description_from_itb(ipath)
        row.update({"ITBFile": iname, "JobDescription": desc, "TenantName": itb.tenant_name, "TenantPhone": itb.tenant_phone})
        if not row["ApartmentUnit"] and itb.apartment_unit:
            row["ApartmentUnit"] = itb.apartment_unit
    if known and known.get("BuildingAddress") == row["BuildingAddress"] and known.get("Latitude"):
        row.update({"Geocode": known.get("Geocode", ""), "Latitude": known["Latitude"], "Longitude": known["Longitude"]})
    elif row["BuildingAddress"]:
        status, lat, lng = F.geocode_address(row["BuildingAddress"])
        row.update({"Geocode": status, "Latitude": lat, "Longitude": lng})
    m = re.search(r"Boro\s*:\s*(Manhattan|Brooklyn|Bronx|Queens|Staten Island)", coa_text, re.I) or re.search(r"\b(MANHATTAN|BROOKLYN|BRONX|QUEENS|STATEN ISLAND)\b", (coa.building_address + " " + coa.location).upper())
    if m:
        row["Borough"] = m.group(1).title()
    return row


def omos_for(args, service):
    if args.omos:
        return [o.strip().upper() for o in args.omos.split(",") if o.strip()]
    if args.rejected:
        with open(os.path.join(ROOT, "public", "data", "hpd_requests.json"), encoding="utf-8") as f:
            asked = json.load(f)["jobs"]
        with open(os.path.join(ROOT, "public", "data", "COA_Fetcher_2026.json"), encoding="utf-8") as f:
            have = {str(j.get("OMO", "")).upper() for j in json.load(f)}
        return sorted(o for o, r in asked.items() if r.get("rejectedTs") and o not in have)
    found, token = [], None
    q = f'from:OMOBid@hpd.nyc.gov "CONFIRMATION OF AWARD" has:attachment after:{args.since} before:{args.before}'
    while True:
        resp = service.users().messages().list(userId="me", q=q, maxResults=500, pageToken=token).execute(num_retries=3)
        for m in resp.get("messages", []):
            msg = service.users().messages().get(userId="me", id=m["id"], format="metadata", metadataHeaders=["Subject"]).execute(num_retries=3)
            names = " ".join(p.get("filename", "") for p in (msg.get("payload", {}).get("parts") or []))
            found += [x.upper() for x in OMO.findall(names + " " + json.dumps(msg.get("payload", {}).get("headers", [])))]
        token = resp.get("nextPageToken")
        if not token:
            break
    return sorted(set(found))


def main():
    a = argparse.ArgumentParser()
    a.add_argument("--omos", default="")
    a.add_argument("--rejected", action="store_true")
    a.add_argument("--since", default="2024/01/01")
    a.add_argument("--before", default="2025/11/26")
    a.add_argument("--refresh", action="store_true", help="read again (keeps the map locations already found)")
    args = a.parse_args()
    service = F.get_gmail_service()
    rows = load()
    previous = dict(rows) if args.refresh else {}
    if args.refresh:
        rows = {k: v for k, v in rows.items() if k not in set(omos_for(args, service))}
    todo = [o for o in omos_for(args, service) if o not in rows]
    print(f"Older jobs: {len(todo)} to read ({len(rows)} already read)", flush=True)
    with tempfile.TemporaryDirectory() as tmp:
        for n, omo in enumerate(todo, 1):
            try:
                row = read_job(service, omo, tmp, previous.get(omo))
            except Exception as error:  # one bad PDF never stops the rest
                print(f"  {omo}: {error}", flush=True)
                row = None
            if row:
                rows[omo] = row
            if n % 10 == 0 or n == len(todo):
                save(rows)
                print(f"  {n}/{len(todo)} · {len(rows)} jobs", flush=True)
            time.sleep(0.05)
    save(rows)
    with_place = sum(1 for r in rows.values() if r.get("Latitude"))
    print(f"Older jobs: {len(rows)} read, {with_place} on the map")


if __name__ == "__main__":
    main()
