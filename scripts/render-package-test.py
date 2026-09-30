from pathlib import Path
import zipfile
import fitz
from PIL import Image

root = Path(__file__).resolve().parents[1] / 'output/pdf/complete-package-test'
for file in root.glob('*.pdf'):
    doc = fitz.open(file)
    assert len(doc) == 3
    pages = []
    for index, page in enumerate(doc):
        target = root / f'{file.stem}-page-{index+1}.png'
        page.get_pixmap(matrix=fitz.Matrix(1.25, 1.25)).save(target)
        pages.append(Image.open(target).convert('RGB'))
    text = '\n'.join(page.get_text() for page in doc)
    assert 'UNITED ANGEL CONSTRUCTION CORP' in text
    assert 'TEST-PACKAGE' in text
    sheet = Image.new('RGB', (sum(p.width for p in pages), max(p.height for p in pages)), 'white')
    x = 0
    for page in pages:
        sheet.paste(page, (x, 0))
        x += page.width
    sheet.save(root / f'{file.stem}-review.png')
    with zipfile.ZipFile(file.with_suffix('.zip')) as package:
        assert package.testzip() is None
        names = package.namelist()
        assert len(names) == 5, names
        for folder in ('images/before/', 'images/after/', 'images/building/', 'invoice-affidavit-package/'):
            assert any(folder in name for name in names), folder
    print(f'PASS {file.stem}: 3 rendered pages, contractor/OMO present, ZIP CRC and 5 files verified')
