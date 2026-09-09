interface DocumentPreviewOptions {
  title: string;
  html: string;
  singlePage?: boolean;
  language?: 'pt' | 'en';
}

/**
 * Opens a rendered document in a new tab. Printing is deliberately opt-in:
 * the user can use the native print dialog to print or choose "Save as PDF".
 */
export function openDocumentPreview({ title, html, singlePage = false, language = 'pt' }: DocumentPreviewOptions): boolean {
  const copy = language === 'en'
    ? {
      blocked: 'Unable to open a new tab. Allow pop-ups to preview the PDF.',
      download: 'Download PDF',
      print: 'Print',
      close: 'Close',
      pdfError: 'Unable to prepare the PDF. Check the internet connection and try again.',
    }
    : {
      blocked: 'Não foi possível abrir uma nova aba. Permita pop-ups para visualizar o PDF.',
      download: 'Descarregar PDF',
      print: 'Imprimir',
      close: 'Fechar',
      pdfError: 'Não foi possível preparar o PDF. Verifica a ligação à internet e tenta novamente.',
    };
  const previewWindow = window.open("", "_blank");
  if (!previewWindow) {
    window.alert(copy.blocked);
    return false;
  }

  const safeTitle = escapeAttribute(title);
  const toolbar = `
    <div class="document-preview-toolbar" data-document-preview-toolbar>
      <strong>${safeTitle}</strong>
      <div class="document-preview-actions">
        <button type="button" onclick="downloadDocumentPdf()">${copy.download}</button>
        <button type="button" onclick="window.print()">${copy.print}</button>
        <button type="button" onclick="window.close()">${copy.close}</button>
      </div>
    </div>
  `;

  const toolbarStyles = `
    <style>
      .document-preview-toolbar { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:14px 24px; background:#111827; color:#fff; position:sticky; top:0; z-index:9999; font-family:system-ui,sans-serif; }
      .document-preview-actions { display:flex; gap:8px; }
      .document-preview-actions button { border:0; border-radius:6px; padding:8px 12px; cursor:pointer; background:#2563eb; color:#fff; font-weight:600; }
      .document-preview-actions button:last-child { background:#374151; }
      @media print { .document-preview-toolbar { display:none !important; } }
    </style>
  `;
  const pdfFilename = `${safeTitle.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '')}.pdf`;
  const pdfScript = singlePage
    ? `
    <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
    <script>
      function waitForImages(root) {
        const images = Array.from(root.querySelectorAll('img'));
        return Promise.all(images.map(image => new Promise(resolve => {
          if (image.complete) {
            resolve();
            return;
          }
          image.addEventListener('load', resolve, { once: true });
          image.addEventListener('error', resolve, { once: true });
        })));
      }

      async function prepareImagesForPdf(root) {
        const images = Array.from(root.querySelectorAll('img'));
        await Promise.all(images.map(image => {
          const source = image.currentSrc || image.src;
          if (!source || source.startsWith('data:') || source.startsWith('blob:')) return Promise.resolve();
          let imageUrl;
          try {
            imageUrl = new URL(source, document.baseURI);
          } catch {
            return Promise.resolve();
          }
          if (imageUrl.origin === window.location.origin) return Promise.resolve();
          return new Promise(resolve => {
            const proxiedImage = new Image();
            proxiedImage.crossOrigin = 'anonymous';
            proxiedImage.onload = () => {
              image.src = proxiedImage.src;
              resolve();
            };
            proxiedImage.onerror = () => resolve();
            proxiedImage.src = 'https://images.weserv.nl/?url=' + encodeURIComponent(imageUrl.href);
          });
        }));
        await waitForImages(root);
      }

      async function downloadDocumentPdf() {
        const content = document.querySelector('[data-document-preview-content]');
        const page = content?.querySelector('[data-document-page]') || content;
        if (!page || typeof window.html2canvas !== 'function') {
          window.alert('${copy.pdfError}');
          return;
        }
        const toolbar = document.querySelector('[data-document-preview-toolbar]');
        if (toolbar) toolbar.style.display = 'none';
        const originalMargin = page.style.margin;
        // The preview intentionally has an outer margin for readability,
        // but keeping it during A4 capture makes an otherwise exact A4 sheet
        // taller than one PDF page and pushes the footer onto page two.
        page.style.margin = '0';
        try {
          await prepareImagesForPdf(page);
          const canvas = await window.html2canvas(page, {
            scale: 2,
            useCORS: true,
            backgroundColor: '#fff',
            logging: false,
          });
          // A CSS sheet can end a few pixels below the A4 ratio because of
          // fractional font/layout measurements. Trim only trailing rows
          // that are effectively white so that this does not become a blank
          // second PDF page.
          const sourceContext = canvas.getContext('2d');
          let sourceCanvas = canvas;
          if (sourceContext) {
            const pixels = sourceContext.getImageData(0, 0, canvas.width, canvas.height).data;
            let lastContentRow = canvas.height - 1;
            while (lastContentRow > 0) {
              let hasContent = false;
              for (let x = 0; x < canvas.width; x += 4) {
                const offset = (lastContentRow * canvas.width + x) * 4;
                if (pixels[offset] < 245 || pixels[offset + 1] < 245 || pixels[offset + 2] < 245) {
                  hasContent = true;
                  break;
                }
              }
              if (hasContent) break;
              lastContentRow -= 1;
            }
            if (lastContentRow < canvas.height - 1) {
              sourceCanvas = document.createElement('canvas');
              sourceCanvas.width = canvas.width;
              sourceCanvas.height = lastContentRow + 1;
              sourceCanvas.getContext('2d')?.drawImage(canvas, 0, 0);
            }
          }
          const JsPdf = window.jspdf?.jsPDF || window.jsPDF;
          if (typeof JsPdf !== 'function') {
            throw new Error('jsPDF não está disponível.');
          }
          const pdf = new JsPdf({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
          const pageWidth = pdf.internal.pageSize.getWidth();
          const pageHeight = pdf.internal.pageSize.getHeight();
          // Split the rendered document into exact A4-height slices instead
          // of letting html2pdf guess where a large sheet should break. The
          // latter can move content to a mostly blank second page when a
          // document is taller than one sheet.
          const sliceHeight = Math.max(1, Math.floor(sourceCanvas.width * pageHeight / pageWidth));
          const pageCanvas = document.createElement('canvas');
          pageCanvas.width = sourceCanvas.width;
          let offset = 0;
          let pageIndex = 0;
          while (offset < sourceCanvas.height) {
            const currentHeight = Math.min(sliceHeight, sourceCanvas.height - offset);
            pageCanvas.height = currentHeight;
            const context = pageCanvas.getContext('2d');
            if (!context) throw new Error('Não foi possível preparar a página PDF.');
            context.fillStyle = '#fff';
            context.fillRect(0, 0, pageCanvas.width, currentHeight);
            context.drawImage(sourceCanvas, 0, offset, sourceCanvas.width, currentHeight, 0, 0, pageCanvas.width, currentHeight);
            if (pageIndex > 0) pdf.addPage();
            pdf.addImage(
              pageCanvas.toDataURL('image/jpeg', 0.98),
              'JPEG',
              0,
              0,
              pageWidth,
              currentHeight * pageWidth / pageCanvas.width,
              undefined,
              'FAST',
            );
            offset += currentHeight;
            pageIndex += 1;
          }
          pdf.save('${pdfFilename}');
        } catch (error) {
          console.error(error);
          window.alert('${copy.pdfError}');
        } finally {
          page.style.margin = originalMargin;
          if (toolbar) toolbar.style.display = '';
        }
      }
    </script>
  `
    : `
    <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>
    <script>
      async function downloadDocumentPdf() {
        const content = document.querySelector('[data-document-preview-content]');
        const page = content?.querySelector('[data-document-page]') || content;
        if (!page || typeof window.html2pdf !== 'function') {
          window.alert('${copy.pdfError}');
          return;
        }
        const toolbar = document.querySelector('[data-document-preview-toolbar]');
        if (toolbar) toolbar.style.display = 'none';
        try {
          await window.html2pdf().set({
            margin: 0,
            filename: '${pdfFilename}',
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true },
            pagebreak: { mode: ['css'], avoid: ['tr'] },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          }).from(page).save();
        } finally {
          if (toolbar) toolbar.style.display = '';
        }
      }
    </script>
  `;
  const documentWithToolbar = html
    .replace(/<head([^>]*)>/i, `<head$1>${toolbarStyles}${pdfScript}`)
    .replace(/<body([^>]*)>/i, `<body$1>${toolbar}<div data-document-preview-content>`)
    .replace(/<\/body>/i, '</div></body>');

  previewWindow.opener = null;
  previewWindow.document.write(documentWithToolbar);
  previewWindow.document.close();
  previewWindow.focus();
  return true;
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
