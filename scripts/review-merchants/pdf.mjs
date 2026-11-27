// A one-page PDF that says plainly it is a placeholder for a review shop, so
// the merchant portal's Documents page links to a real file and nobody can
// mistake it for a licence.

const esc = (s) => s.replace(/[\()]/g, (c) => `\${c}`).replace(/[^\x20-\x7e]/g, '-');

export function pdfPlaceholder(title, holder) {
  const lines = [
    ['F2', 20, 'NexG review test shop'],
    ['F1', 13, 'Not a real document.'],
    ['F1', 11, ''],
    ['F1', 11, `Document: ${title}`],
    ['F1', 11, `Business: ${holder}`],
    ['F1', 11, ''],
    ['F1', 11, 'This file stands in for the document above on a test merchant used for'],
    ['F1', 11, 'App Store and Google Play review. It is not issued by any authority.'],
  ];
  let y = 760;
  const content = lines.map(([f, size, text]) => { const out = `BT /${f} ${size} Tf 72 ${y} Td (${esc(text)}) Tj ET`; y -= size + 10; return out; }).join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ];
  let out = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((o, i) => { offsets.push(Buffer.byteLength(out)); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
