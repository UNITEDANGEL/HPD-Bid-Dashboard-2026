"""Invitation reader (scripts/fetch_upcoming_bids.py): what page 1's OCR text and the last page give."""
import importlib.util
import os

spec = importlib.util.spec_from_file_location("ub", os.path.join(os.path.dirname(__file__), "fetch_upcoming_bids.py"))
ub = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ub)

# Real OCR of ER07193's page 1 (0 read as O in the OMO, address squashed on the same line).
page1 = """INVITATION TO BID QUOTATION SHEET
Date Mailed, Fax, P/U: 10/6/26 OMO #: ERO7193 BID DUE: 10/7/26 11:30 AM
Work Start Date: 10/7/26 Building Address: 216 EAST 122 STREET
Work Completion Date: 10/13/26 Boro: Manhattan
This is an invitation to submit a bid for the open market order (OMO) noted above"""
info = ub.parse_invitation_text(page1, "BUILDING ADDRESS: 216 EAST 122 STREET BOROUGH: MANHATTAN")
assert info == {"omo": "ER07193", "bidDue": "2026-10-07", "bidDueTime": "11:30 AM", "workStart": "2026-10-07",
                "workCompletion": "2026-10-13", "address": "216 EAST 122 STREET", "borough": "MN"}, info

# The last page's printed address wins over OCR that dropped a space.
info = ub.parse_invitation_text(page1.replace("216 EAST 122 STREET", "41-1550 STREET"), "BUILDING ADDRESS: 41-15 50 STREET BOROUGH: QUEENS")
assert info["address"] == "41-15 50 STREET" and info["borough"] == "MN", info  # Boro on page 1 still read

# No address on page 1: the last page fills it in; a date without a time still works.
info = ub.parse_invitation_text("OMO #: EQ31457 BID DUE: 1/5/2027", "BUILDING ADDRESS: 75 LENOX ROAD BOROUGH: BROOKLYN")
assert (info["omo"], info["bidDue"], info["bidDueTime"], info["address"], info["borough"]) == ("EQ31457", "2027-01-05", "", "75 LENOX ROAD", "BK"), info

assert ub.normalize_omo("ERO7193") == "ER07193" and ub.normalize_omo("eq 12345") == "EQ12345" and ub.normalize_omo("XYZ") == ""
# An extra zero from OCR ("ER007032") must still match the awarded job ER07032.
assert ub.normalize_omo("ER007032") == "ER07032" and ub.normalize_omo("ERO01085") == "ER01085"
assert ub.omo_from_filename("ER07193_100626035429.pdf") == "ER07193" and ub.omo_from_filename("faxCopy_2025.pdf") == ""

# Job description: after "Job Description:", without HPD's standard contact / affidavit lines.
page3 = """Page 3 of 3
OMO No: ER07032   Issuer: DHANYA RAJAN
Job Description:
REPLACE 3RD STY HOPPER LATCH SET
TOTAL DOOR = 1
CONTRACTOR MUST CONTACT HPD WITH START DATE: R. BUSHRA- 212 863 6046"""
assert ub.job_description(page3) == "REPLACE 3RD STY HOPPER LATCH SET TOTAL DOOR = 1", ub.job_description(page3)

# A long job continues on page 4, under the wage header and some scan debris; the bid form ends it.
import sys  # noqa: E402
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import itb_text  # noqa: E402
NL = chr(10)
pages = [
    "cover",
    "omo form",
    NL.join(["OMO No: ER1", "Job Description:", "1) AT HOPPER DOOR REPLACE LATCH", "2) AT BULKHEAD DOOR INSTALL CLOSER"]),
    NL.join([" ", " ", "General Decision Number: NY200003 04/10/2020Superseded General Decision Number: NY190003State: New Yor",
             "NO", ":", "V N O", "3) AT ENTRANCE DOOR REPLACE LATCH SET", "TOTAL DOORS = 3", "CONTRACTOR MUST CONTACT HPD WITH START DATE"]),
    NL.join(["WORK DESCRIPTION FORM", "BID AMOUNT $"]),
]
work, used = itb_text.work_text(pages)
assert used == [3, 4], used
desc = ub.job_description(work)
assert "3) AT ENTRANCE DOOR REPLACE LATCH SET TOTAL DOORS = 3" in desc and "General Decision" not in desc and "V N O" not in desc, desc
assert "CONTRACTOR MUST CONTACT" in ub.job_notes(work)
assert itb_text.work_text(["a", "b", "Job Description: X", "WORK DESCRIPTION FORM"])[1] == [3]

print("PASS upcoming bids reader: OMO (O->0), bid due date/time, work dates, address (last page wins), boro, job description (page 3 + continuation pages)")
