"""HPD invitations put the job description on page 3, but long jobs continue on page 4 (or later), under a
"General Decision Number ..." wage header and sometimes some scanning debris (ER07755: items 8-10 and
"TOTAL = 10" are on page 4). These helpers join page 3 with its continuation pages, stopping at HPD's
bid form ("WORK DESCRIPTION FORM" / "BID AMOUNT").

  work_text(page_texts)  -> (text, pages)   page_texts: every page's text, in order; pages are 1-based

Some invitations leave page 3 empty (ER09499, EQ31601: no text and no scan) and the work is only typed on HPD's
order form, page 2, under "WORK DESCRIPTION": work_text(..., page3_blank=True) reads it from there (pages [2]).
"""
import re

FORM_PAGE = re.compile(r"WORK\s+DESCRIPTION\s+FORM|BID\s+AMOUNT", re.I)
WAGE_PAGE = re.compile(r"Rates\s+Fringes|Davis-Bacon|WAGE\s+DETERMINATION", re.I)
WAGE_HEADER = re.compile(r"(Superseded\s+)?General\s+Decision\s+Number|^State:\s*New\s+Yor", re.I)


def continuation(text):
    """A page after page 3, cleaned: the wage header line removed, and the short debris lines the scan
    leaves before the first real line. Empty if it's a wage-rate page or has nothing."""
    if WAGE_PAGE.search(text or "") and not re.search(r"^\s*\d+\s*\)", text or "", re.M):
        return ""
    out, started = [], False
    for line in (text or "").splitlines():
        s = line.strip()
        if not s or WAGE_HEADER.search(s):
            continue
        if not started and len(re.sub(r"\s", "", s)) <= 4:
            continue  # "NO", "V N O", "CC SS", ":" ...
        started = True
        out.append(line)
    return "\n".join(out)


def page_is_blank(page):
    """A PyMuPDF page with no text and no picture (a scan has a picture: its words are in the picture)."""
    return not (page.get_text() or "").strip() and not page.get_images()


def order_text(text):
    """The work typed on HPD's order form (page 2): the lines before the form's own labels ("(Site)", "X")."""
    out = []
    for line in (text or "").splitlines():
        s = line.strip()
        if s == "(Site)":
            break
        if s:
            out.append(s)
    while out and out[-1] == "X":
        out.pop()
    return "\n".join(out)


def work_text(page_texts, page3_blank=False):
    texts = list(page_texts or [])
    if len(texts) < 3:
        return "", []
    if page3_blank:
        work = order_text(texts[1])
        if work.strip():
            return work, [2]
    parts, pages = [texts[2]], [3]
    for i in range(3, len(texts)):
        if FORM_PAGE.search(texts[i] or ""):
            break
        extra = continuation(texts[i])
        if extra.strip():
            parts.append(extra)
            pages.append(i + 1)
    return "\n".join(parts), pages
