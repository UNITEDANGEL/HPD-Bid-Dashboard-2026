"""A reply that quotes HPD's list must not count as answering every OMO in the quote (19 Nov: 18 notices left the board)."""
import os, re, sys
sys.path.insert(0, os.path.dirname(__file__))
import importlib.util
src = open(os.path.join(os.path.dirname(__file__), "fetch_hpd_requests.py"), encoding="utf-8").read()
m = re.search(r"def own_part\(text\):.*?return cut\[0\]", src, re.S)
ns = {"re": re}
exec(m.group(0), ns)
own_part = ns["own_part"]
reply = "Good morning Joy-Ann,\n\nThank you. We will begin work.\n\nBest regards,\n\nJot\n\nOn Wed, Nov 18, 2026 at 3:49 PM Lewis, Joy-Ann (HPD) <LewisJ@hpd.nyc.gov>\nwrote:\n\nOMO#ER00322- 24 HR POOR PERFORMANCE NOTICE\n"
assert "ER00322" not in own_part(reply), own_part(reply)
one_line = "Hi\nSent.\nOn Wed, Nov 18, 2026 at 3:49 PM Joy <a@b.c> wrote:\nOMO#ER00322"
assert "ER00322" not in own_part(one_line)
assert "ER00999" in own_part("Please see OMO#ER00999 attached\nOn Wed wrote: x")
print("own_part ok")
