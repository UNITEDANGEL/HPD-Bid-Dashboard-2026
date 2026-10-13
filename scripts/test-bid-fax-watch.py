"""Fax checker rules (scripts/check_bid_faxes.py) without Gmail or the network."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from check_bid_faxes import PRICE, SUBJECT, fax_result, should_check  # noqa: E402

m = SUBJECT.search("Bid - OMO ER07648 - 165 HIMROD STREET - United Angel Construction Corp.")
assert m and m.group(2) == "ER07648" and m.group(3) == "165 HIMROD STREET" and not m.group(1)
m = SUBJECT.search("REVISED Bid - OMO ER05994 - 1987 ADAM C POWELL BOULEVARD - United Angel Construction Corp.")
assert m and m.group(1) and m.group(2) == "ER05994"
assert PRICE.search("ER07648_BID_970_165-HIMROD-STREET.pdf").group(1) == "970"
assert PRICE.search("ER05994_REVISED_BID_1987_1987-ADAM.pdf").group(1) == "1987"
assert fax_result('HumbleFax - Successful Transmission to "(212) 863-8655" Re: Bid - OMO ER07717', "Sent Successfully") == "confirmed"
assert fax_result("HumbleFax - Failed Transmission", "The line was busy") == "failed"
assert fax_result("HumbleFax newsletter", "") == ""

today = "2026-10-13"
assert should_check({}, today)[0] is False, "nothing to do: no Gmail read"
assert should_check({"BID-ER1": {"status": "confirmed"}}, today)[0] is False
assert should_check({"BID-ER1": {"status": "sent"}}, today)[0] is True, "a fax going through"
assert should_check({"BIDDING-SESSION": {"active": True, "day": today}}, today)[0] is True, "bidding session on"
assert should_check({"BIDDING-SESSION": {"active": True, "day": "2026-10-12"}}, today)[0] is False, "yesterday's session"
assert should_check({"BIDDING-SESSION": {"active": False, "day": today}}, today)[0] is False, "ended"
assert should_check({}, today, force=True)[0] is True
print("PASS fax watch: subjects and prices read from the fax emails, HumbleFax success / failure, checks only while bidding")
