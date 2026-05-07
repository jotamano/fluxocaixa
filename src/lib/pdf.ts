import type { Tables } from "@/integrations/supabase/types";
import type { Invoice } from "@/hooks/use-data";
import {
  getInvoiceItemsTotal,
  getInvoiceIvaAmount,
  getInvoiceTotalWithIva,
  getEffectiveIvaPercentage,
  formatCurrency,
  formatInvoiceItemPeriod,
} from "./data";
import { BRAND_NAME, brandHeaderBlock } from "./branding";

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

type Client = Tables<"clients">;

export function generateInvoicePDF(invoice: Invoice, client: Client) {
  const total = getInvoiceItemsTotal(invoice.invoice_items);
  const ivaPct = getEffectiveIvaPercentage(invoice);
  const iva = getInvoiceIvaAmount(invoice.invoice_items, invoice);
  const totalComIva = getInvoiceTotalWithIva(invoice.invoice_items, invoice);

  const itemsRows = invoice.invoice_items.map(item => {
    const period = formatInvoiceItemPeriod(item.service_start_date, item.service_end_date);
    const descCell = period
      ? `${escapeHtml(item.description)}<div style="margin-top:2px;font-size:11px;color:#6b7280;">${escapeHtml(period)}</div>`
      : escapeHtml(item.description);
    return `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;">${descCell}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:center;">${item.quantity}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right;">${formatCurrency(Number(item.unit_price))}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right;font-weight:600;">${formatCurrency(item.quantity * Number(item.unit_price))}</td>
    </tr>
  `;
  }).join("");

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Orçamento ${invoice.number}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', system-ui, sans-serif; color: #1a1a2e; background: #fff; }
        @media print { body { -webkit-print-color-adjust: exact; } }
      </style>
    </head>
    <body>
      <div style="max-width:800px;margin:0 auto;padding:40px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:40px;">
          ${brandHeaderBlock()}
          <div style="text-align:right;">
            <h2 style="font-size:22px;font-weight:700;color:#1a1a2e;">Orçamento ${invoice.number}</h2>
            <p style="font-size:12px;color:#6b7280;margin-top:4px;">
              Emissão: ${new Date(invoice.issue_date).toLocaleDateString('pt-PT')}<br/>
              Vencimento: ${new Date(invoice.due_date).toLocaleDateString('pt-PT')}
            </p>
          </div>
        </div>

        <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin-bottom:30px;">
          <p style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#6b7280;margin-bottom:8px;">Proposta para</p>
          <p style="font-size:16px;font-weight:700;">${client.company}</p>
          <p style="font-size:13px;color:#4b5563;margin-top:4px;">${client.name}</p>
          <p style="font-size:13px;color:#4b5563;">${client.email}${client.phone ? ` · ${client.phone}` : ""}</p>
          ${client.nif ? `<p style="font-size:13px;color:#4b5563;">NIF: ${client.nif}</p>` : ""}
        </div>

        <table style="width:100%;border-collapse:collapse;margin-bottom:30px;">
          <thead>
            <tr style="background:#1e40af;color:#fff;">
              <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:600;">Descrição</th>
              <th style="padding:10px 12px;text-align:center;font-size:12px;font-weight:600;">Qtd</th>
              <th style="padding:10px 12px;text-align:right;font-size:12px;font-weight:600;">Preço Unit.</th>
              <th style="padding:10px 12px;text-align:right;font-size:12px;font-weight:600;">Total</th>
            </tr>
          </thead>
          <tbody>${itemsRows}</tbody>
        </table>

        <div style="display:flex;justify-content:flex-end;">
          <div style="width:260px;">
            <div style="display:flex;justify-content:space-between;padding:8px 0;font-size:14px;${ivaPct > 0 ? '' : 'border-bottom:1px solid #e5e7eb;'}">
              <span style="color:#6b7280;">Subtotal</span>
              <span>${formatCurrency(total)}</span>
            </div>
            ${ivaPct > 0 ? `
            <div style="display:flex;justify-content:space-between;padding:8px 0;font-size:14px;border-bottom:1px solid #e5e7eb;">
              <span style="color:#6b7280;">IVA (${ivaPct}%)</span>
              <span>${formatCurrency(iva)}</span>
            </div>` : ""}
            <div style="display:flex;justify-content:space-between;padding:12px 0;font-size:18px;font-weight:700;">
              <span>Total</span>
              <span style="color:#1e40af;">${formatCurrency(totalComIva)}</span>
            </div>
          </div>
        </div>

        ${invoice.notes ? `
          <div style="margin-top:30px;padding:16px;background:#f8fafc;border-radius:8px;border:1px solid #e5e7eb;">
            <p style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#6b7280;margin-bottom:6px;">Notas</p>
            <p style="font-size:13px;color:#4b5563;">${invoice.notes}</p>
          </div>
        ` : ""}

        <div style="margin-top:50px;padding-top:20px;border-top:1px solid #e5e7eb;text-align:center;">
          <p style="font-size:11px;color:#9ca3af;">${BRAND_NAME} · Orçamento gerado automaticamente</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const printWindow = window.open("", "_blank");
  if (printWindow) {
    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
  }
}
