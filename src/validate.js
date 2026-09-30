import fs from 'node:fs';

// Detect a file type from its first bytes (and, for zip-based Office files, its contents).
export function detectType(buf, filename = '') {
  if (!buf || buf.length === 0) return 'empty';
  const head = buf.subarray(0, 16);
  const ascii = head.toString('latin1');
  if (ascii.startsWith('%PDF')) return 'pdf';
  if (head[0] === 0x89 && ascii.slice(1, 4) === 'PNG') return 'png';
  if (head[0] === 0xff && head[1] === 0xd8) return 'jpg';
  if (ascii.startsWith('RIFF') && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  if (head[0] === 0xd0 && head[1] === 0xcf) return 'doc'; // legacy OLE Office file
  if (ascii.startsWith('PK')) {
    const body = buf.toString('latin1');
    if (body.includes('word/')) return 'docx';
    if (body.includes('xl/')) return 'xlsx';
    if (body.includes('ppt/')) return 'pptx';
    return 'zip';
  }
  const text = buf.subarray(0, 2048).toString('utf8').trimStart();
  if (/^(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(text) || /<svg[\s>]/i.test(text.slice(0, 400))) return 'svg';
  if (/\.txt$/i.test(filename) || isMostlyText(buf)) return 'txt';
  return 'unknown';
}

function isMostlyText(buf) {
  const s = buf.subarray(0, 4096);
  let printable = 0;
  for (const b of s) if (b === 9 || b === 10 || b === 13 || (b >= 32 && b < 127) || b >= 128) printable++;
  return printable / s.length > 0.95;
}

export function validateOutput(path, filename, expect) {
  const buf = fs.readFileSync(path);
  const type = detectType(buf, filename);
  const ok = buf.length > 0 && expect.includes(type);
  return {
    ok,
    type,
    bytes: buf.length,
    message: ok
      ? `Valid ${type.toUpperCase()} (${fmtBytes(buf.length)})`
      : `Output was ${type} (${fmtBytes(buf.length)}), expected ${expect.join('/')}`,
  };
}

export const fmtBytes = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(2)} MB`);
