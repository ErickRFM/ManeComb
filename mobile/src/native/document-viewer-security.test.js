import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(
  path.resolve(
    __dirname,
    '../../android/app/src/main/java/com/anonymous/combiscontrol/documents/ManeCombDocumentViewerActivity.kt'
  ),
  'utf8'
);

describe('Android protected document viewer', () => {
  it('backs the PROTEGIDO label with FLAG_SECURE', () => {
    expect(source).toContain('WindowManager.LayoutParams.FLAG_SECURE');
    expect(source).toContain('text = "PROTEGIDO"');
  });

  it('renders PDF pages on demand with one bitmap authority', () => {
    expect(source).toContain('private var renderedBitmap: Bitmap? = null');
    expect(source).toContain('private var pdfRenderer: PdfRenderer? = null');
    expect(source).toContain('private fun renderPdfPage(index: Int)');
    expect(source).toContain('replaceRenderedBitmap(bitmap)');
    expect(source).toContain('previous.recycle()');
    expect(source).not.toContain('private val renderedBitmaps = mutableListOf<Bitmap>()');
    expect(source).not.toContain('for (index in 0 until renderer.pageCount)');
  });

  it('keeps explicit page navigation and closes renderer on destroy/error', () => {
    expect(source).toContain('buildPageButton("Anterior")');
    expect(source).toContain('buildPageButton("Siguiente")');
    expect(source).toContain('closePdfRenderer()');
    expect(source).toMatch(/override fun onDestroy\(\)[\s\S]*clearRenderedBitmap\(\)[\s\S]*closePdfRenderer\(\)/);
  });
});
