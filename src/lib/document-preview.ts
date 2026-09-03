interface DocumentPreviewOptions {
  title: string;
  html: string;
}

/**
 * Opens a rendered document in a new tab. Printing is deliberately opt-in:
 * the user can use the native print dialog to print or choose "Save as PDF".
 */
export function openDocumentPreview({ title, html }: DocumentPreviewOptions): boolean {
  const previewWindow = window.open("", "_blank");
  if (!previewWindow) {
    window.alert("Não foi possível abrir uma nova aba. Permita pop-ups para visualizar o PDF.");
    return false;
  }

  const toolbar = `
    <div class="document-preview-toolbar" data-document-preview-toolbar>
      <strong>${escapeAttribute(title)}</strong>
      <div class="document-preview-actions">
        <button type="button" onclick="window.print()">Imprimir / guardar como PDF</button>
        <button type="button" onclick="window.close()">Fechar</button>
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
  const documentWithToolbar = html
    .replace(/<head([^>]*)>/i, `<head$1>${toolbarStyles}`)
    .replace(/<body([^>]*)>/i, `<body$1>${toolbar}`);

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
