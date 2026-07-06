import { jsPDF } from 'jspdf';

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((msg: any, _sender: any) => {
    if (msg.action === 'generateHTML') {
      handleGenerateHTML(msg);
    } else if (msg.action === 'generatePDF') {
      handleGeneratePDF(msg);
    }
  });
});

// ── HTML Generation ──────────────────────────────

interface HTMLMessage {
  action: 'generateHTML';
  canvasDataURL: string;
  title: string;
  sourceUrl: string;
  contentHTML: string;
  textNotes: Array<{ x: number; y: number; text: string; style: string }>;
  mode: 'dom' | 'canvas';
  canvasWidth?: number;
  canvasHeight?: number;
}

async function handleGenerateHTML(msg: HTMLMessage): Promise<void> {
  const { canvasDataURL, title, sourceUrl, contentHTML, textNotes, mode } = msg;

  let fullHTML: string;

  if (mode === 'canvas') {
    fullHTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Readmd Export - ${title}</title>
<style>
  body {
    max-width: 100%;
    margin: 0 auto;
    padding: 10px;
    font-family: system-ui, -apple-system, sans-serif;
    background: #fbfbf9;
  }
  img { max-width: 100%; height: auto; display: block; }
</style>
</head>
<body>
<h1>${title || 'Readmd Export'}</h1>
<p><small>Exported from: ${sourceUrl}</small></p>
<hr>
<img src="${canvasDataURL}" alt="Annotated page" />
</body>
</html>`;
  } else {
    const notesHTML = textNotes
      .map(
        (n) =>
          `<div class="readmd-text-note confirmed" style="${n.style.replace(/"/g, '&quot;')}" contenteditable="false">${n.text}</div>`,
      )
      .join('\n');

    fullHTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Readmd Export - ${title}</title>
<style>
  body {
    max-width: 900px;
    margin: 0 auto;
    padding: 20px;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 16px;
    line-height: 1.6;
    color: #333;
    background: #fbfbf9;
  }
  img { max-width: 100%; height: auto; }
  pre {
    padding: 1rem;
    overflow-x: auto;
    background: rgba(128,128,128,0.05);
    border: 1px solid rgba(128,128,128,0.1);
    border-radius: 4px;
    font-family: "Fira Code", Consolas, monospace;
  }
  code { padding: 0.2em 0.4em; background: rgba(128,128,128,0.1); border-radius: 3px; }
  pre code { padding: 0; background: transparent; }
  .export-wrapper {
    position: relative;
    width: 100%;
  }
  .export-content {
    position: relative;
    z-index: 1;
  }
  .export-annotation-canvas {
    position: absolute;
    top: 0;
    left: 0;
    z-index: 2;
    pointer-events: none;
  }
  .readmd-text-note {
    position: absolute;
    z-index: 3;
    min-width: 60px;
    padding: 4px 8px;
    border: 1px solid rgba(0,0,0,0.15);
    border-radius: 4px;
    background: rgba(255,255,180,0.75);
    font-size: 14px;
    line-height: 1.4;
    color: #333;
    white-space: pre-wrap;
    word-break: break-word;
  }
  mark[data-highlight-id] {
    color: inherit;
    padding: 0 1px;
    border-radius: 2px;
  }
</style>
</head>
<body>
<h1>${title || 'Readmd Export'}</h1>
<p><small>Exported from: ${sourceUrl}</small></p>
<hr>
<div class="export-wrapper">
  <div class="export-content">
    ${contentHTML}
  </div>
  <img class="export-annotation-canvas"
       src="${canvasDataURL}"
       alt="Drawing annotations"
       style="width:${msg.canvasWidth || 'auto'}px;height:${msg.canvasHeight || 'auto'}px;" />
  ${notesHTML}
</div>
</body>
</html>`;
  }

  // Download via Blob URL — avoids encodeURIComponent overhead on large files
  const blob = new Blob([fullHTML], { type: 'text/html;charset=utf-8' });
  const blobUrl = URL.createObjectURL(blob);
  await browser.downloads.download({
    url: blobUrl,
    filename: 'readmd-export.html',
    saveAs: true,
  });
  setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
}

// ── PDF Generation ───────────────────────────────

interface PDFMessage {
  action: 'generatePDF';
  canvasDataURL: string;
  title: string;
  canvasWidth: number;
  canvasHeight: number;
}

async function handleGeneratePDF(msg: PDFMessage): Promise<void> {
  const { canvasDataURL, canvasWidth, canvasHeight } = msg;

  const pdf = new jsPDF('p', 'mm', 'a4', true);
  const imgWidth = 210; // A4 width in mm
  const pageHeight = 297; // A4 height in mm
  const imgHeight = (canvasHeight * imgWidth) / canvasWidth;

  let heightLeft = imgHeight;
  let position = 0;

  pdf.addImage(canvasDataURL, 'JPEG', 0, position, imgWidth, imgHeight);
  heightLeft -= pageHeight;

  while (heightLeft > 0) {
    position = heightLeft - imgHeight;
    pdf.addPage();
    pdf.addImage(canvasDataURL, 'JPEG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
  }

  // Use Blob output instead of datauristring — avoids 33% base64 overhead
  const pdfBlob = pdf.output('blob');
  const blobUrl = URL.createObjectURL(pdfBlob);
  await browser.downloads.download({
    url: blobUrl,
    filename: 'readmd-export.pdf',
    saveAs: true,
  });
  // Clean up blob URL after a short delay
  setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
}
