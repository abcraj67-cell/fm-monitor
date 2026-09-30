// Every feature on filemagics.com that the monitor exercises.
//
// files   – fixtures to upload (from /fixtures)
// expect  – acceptable output types (checked by magic bytes, see validate.js)
// prep    – optional steps to run after upload and before the main action
// action  – regex for the main action button (falls back to a generic matcher)
// smoke   – true = only check that the page loads and accepts the upload
//           (used for interactive tools such as the visual editor)

export const BASE_URL = process.env.BASE_URL || 'https://www.filemagics.com';

export const TOOLS = [
  // ---------- PDF → other formats ----------
  { slug: 'pdf-to-doc',   name: 'PDF to Word',        group: 'PDF Tools', files: ['sample.pdf'], expect: ['docx', 'doc', 'zip'] },
  { slug: 'pdf-to-excel', name: 'PDF to Excel',       group: 'PDF Tools', files: ['sample.pdf'], expect: ['xlsx', 'zip'] },
  { slug: 'pdf-to-ppt',   name: 'PDF to PowerPoint',  group: 'PDF Tools', files: ['sample.pdf'], expect: ['pptx', 'zip'] },
  { slug: 'pdf-to-pdfa',  name: 'PDF to PDF/A',       group: 'PDF Tools', files: ['sample.pdf'], expect: ['pdf'] },
  { slug: 'pdf-to-text',  name: 'PDF to Text',        group: 'PDF Tools', files: ['sample.pdf'], expect: ['txt'] },
  { slug: 'pdf-to-image', name: 'PDF to Image',       group: 'PDF Tools', files: ['sample.pdf'], expect: ['png', 'jpg', 'zip'] },

  // ---------- PDF editing ----------
  { slug: 'merge-pdf',           name: 'Merge PDF',          group: 'PDF Tools', files: ['sample.pdf', 'sample2.pdf'], expect: ['pdf'] },
  { slug: 'compress-pdf',        name: 'Compress PDF',       group: 'PDF Tools', files: ['sample.pdf'], expect: ['pdf'] },
  { slug: 'enhance-pdf-quality', name: 'Enhance PDF Quality', group: 'PDF Tools', files: ['sample.pdf'], expect: ['pdf'] },
  { slug: 'edit-pdf',            name: 'Edit PDF',           group: 'PDF Tools', files: ['sample.pdf'], expect: ['pdf'], smoke: true },
  { slug: 'crop-pdf',            name: 'Crop PDF',           group: 'PDF Tools', files: ['sample.pdf'], expect: ['pdf'], action: /crop/i },
  { slug: 'add-page-numbers',    name: 'Add Page Numbers',   group: 'PDF Tools', files: ['sample.pdf'], expect: ['pdf'], action: /add (page )?numbers|apply|number/i },
  { slug: 'rotate-pdf',          name: 'Rotate PDF',         group: 'PDF Tools', files: ['sample.pdf'], expect: ['pdf'],
    prep: [{ click: /^90°\s*Clockwise/i }], action: /^rotate pdf/i },
  { slug: 'extract-pages',       name: 'Extract Pages',      group: 'PDF Tools', files: ['sample.pdf'], expect: ['pdf', 'zip'],
    prep: [{ click: /^select all$/i, optional: true }, { range: '1-2' }], action: /^extract pages/i },
  { slug: 'organize-pdf',        name: 'Organize PDF',       group: 'PDF Tools', files: ['sample.pdf'], expect: ['pdf'], action: /organi[sz]e|save|apply|download/i },
  { slug: 'remove-pages',        name: 'Remove Pages',       group: 'PDF Tools', files: ['sample.pdf'], expect: ['pdf'],
    prep: [{ range: '2' }], action: /remove|delete/i },
  { slug: 'repair-pdf',          name: 'Repair PDF',         group: 'PDF Tools', files: ['sample.pdf'], expect: ['pdf'] },
  { slug: 'ocr-pdf',             name: 'OCR PDF',            group: 'PDF Tools', files: ['sample.pdf'], expect: ['pdf', 'txt'], timeoutMs: 180000 },

  // ---------- Other formats → PDF ----------
  { slug: 'html-to-pdf',  name: 'HTML to PDF',       group: 'Document Tools', files: ['sample.html'], expect: ['pdf', 'zip'] },
  { slug: 'docs-to-pdf',  name: 'Word to PDF',       group: 'Document Tools', files: ['sample.docx'], expect: ['pdf'] },
  { slug: 'excel-to-pdf', name: 'Excel to PDF',      group: 'Document Tools', files: ['sample.xlsx'], expect: ['pdf'] },
  { slug: 'ppt-to-pdf',   name: 'PowerPoint to PDF', group: 'Document Tools', files: ['sample.pptx'], expect: ['pdf'] },
  { slug: 'md-to-pdf',    name: 'Markdown to PDF',   group: 'Document Tools', files: ['sample.md'],   expect: ['pdf'] },
  { slug: 'scan-to-pdf',  name: 'Scan to PDF',       group: 'PDF Tools', files: ['sample.jpg', 'sample2.jpg'], expect: ['pdf'] },
  { slug: 'image-to-pdf', name: 'Image to PDF',      group: 'Image Tools', files: ['sample.jpg', 'sample.png'], expect: ['pdf'] },

  // ---------- Image tools ----------
  { slug: 'png-to-jpg',     name: 'PNG to JPG',     group: 'Image Tools', files: ['sample.png'],  expect: ['jpg'] },
  { slug: 'jpg-to-png',     name: 'JPG to PNG',     group: 'Image Tools', files: ['sample.jpg'],  expect: ['png'] },
  { slug: 'webp-to-png',    name: 'WEBP to PNG',    group: 'Image Tools', files: ['sample.webp'], expect: ['png'] },
  { slug: 'compress-image', name: 'Compress Image', group: 'Image Tools', files: ['sample.jpg'],  expect: ['jpg', 'png', 'webp'] },
  { slug: 'png-to-svg',     name: 'PNG to SVG',     group: 'Image Tools', files: ['sample.png'],  expect: ['svg'] },
  { slug: 'svg-to-png',     name: 'SVG to PNG',     group: 'Image Tools', files: ['sample.svg'],  expect: ['png'] },
];

// Informational pages: must load (HTTP 200) with content.
export const PAGES = [
  { path: '/', name: 'Home page', mustContain: /pdf/i },
  { path: '/blog', name: 'Blog' },
  { path: '/about-us', name: 'About us' },
  { path: '/contact-us', name: 'Contact us' },
  { path: '/faq', name: 'FAQ' },
  { path: '/privacy-policy', name: 'Privacy policy' },
  { path: '/terms-conditions', name: 'Terms & conditions' },
  { path: '/support-us', name: 'Support us' },
];
