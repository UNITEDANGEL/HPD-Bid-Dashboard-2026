
import sys
from PyPDF2 import PdfReader

path = sys.argv[1]
reader = PdfReader(path)
text = ""
for page in reader.pages:
    text += page.extract_text() or ""
print(text)
