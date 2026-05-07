import type { Client, Invoice, Payment } from "@/hooks/use-data";
import {
  formatCurrency,
  getInvoiceItemsTotal,
  getInvoiceIvaAmount,
  getInvoiceTotalWithIva,
  getEffectiveIvaPercentage,
  methodLabels,
} from "./data";
import { BRAND_NAME, brandHeaderBlock } from "./branding";

export function generateClientStatement(
  client: Client,
  invoices: Invoice[],
  payments: Payment[],
) {
  const clientInvoices = invoices
    .filter(i => i.client_id === client.id)
    .sort((a, b) => new Date(a.issue_date).getTime() - new Date(b.issue_date).getTime());

  const clientPayments = payments
    .filter(p => p.client_id === client.id)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const subtotalBilled = clientInvoices.reduce((s, i) => s + getInvoiceItemsTotal(i.invoice_items), 0);
  const ivaBilled = clientInvoices.reduce((s, i) => s + getInvoiceIvaAmount(i.invoice_items, i), 0);
  const totalBilled = clientInvoices.reduce((s, i) => s + getInvoiceTotalWithIva(i.invoice_items, i), 0);
  const totalPaid = clientPayments.reduce((s, p) => s + Number(p.amount), 0);
  const outstanding = Math.max(totalBilled - totalPaid, 0);

  const invoiceRows = clientInvoices.map(inv => {
    const subtotal = getInvoiceItemsTotal(inv.invoice_items);
    const total = getInvoiceTotalWithIva(inv.invoice_items, inv);
    const ivaPct = getEffectiveIvaPercentage(inv);
    const ivaCell = ivaPct > 0 ? `${ivaPct}%` : "—";
    const invPayments = clientPayments.filter(p => p.invoice_id === inv.id);
    const paid = invPayments.reduce((s, p) => s + Number(p.amount), 0);
    const remaining = Math.max(total - paid, 0);
    return `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;">${inv.number}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:center;">${new Date(inv.issue_date).toLocaleDateString("pt-PT")}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:center;">${new Date(inv.due_date).toLocaleDateString("pt-PT")}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right;">${formatCurrency(subtotal)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:center;color:#6b7280;">${ivaCell}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right;">${formatCurrency(total)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right;">${formatCurrency(paid)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right;font-weight:600;">${formatCurrency(remaining)}</td>
      </tr>`;
  }).join("");

  const paymentRows = clientPayments.map(p => {
    const inv = clientInvoices.find(i => i.id === p.invoice_id);
    return `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;">${new Date(p.date).toLocaleDateString("pt-PT")}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:center;">${inv?.number || "—"}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:center;">${methodLabels[p.method]}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right;font-weight:600;">${formatCurrency(Number(p.amount))}</td>
      </tr>`;
  }).join("");

  const today = new Date().toLocaleDateString("pt-PT");

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Extrato de Conta — ${client.company}</title>
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
            <h2 style="font-size:20px;font-weight:700;color:#1a1a2e;">Extrato de Conta</h2>
            <p style="font-size:12px;color:#6b7280;margin-top:4px;">Data: ${today}</p>
          </div>
        </div>

        <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin-bottom:30px;">
          <p style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#6b7280;margin-bottom:8px;">Cliente</p>
          <p style="font-size:16px;font-weight:700;">${client.company}</p>
          <p style="font-size:13px;color:#4b5563;margin-top:4px;">${client.name}</p>
          <p style="font-size:13px;color:#4b5563;">${client.email}${client.phone ? ` · ${client.phone}` : ""}</p>
          ${client.nif ? `<p style="font-size:13px;color:#4b5563;">NIF: ${client.nif}</p>` : ""}
        </div>

        <div style="display:flex;gap:16px;margin-bottom:30px;flex-wrap:wrap;">
          <div style="flex:1;min-width:140px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;text-align:center;">
            <p style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">Subtotal</p>
            <p style="font-size:20px;font-weight:700;color:#1a1a2e;margin-top:4px;">${formatCurrency(subtotalBilled)}</p>
          </div>
          <div style="flex:1;min-width:140px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;text-align:center;">
            <p style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">IVA</p>
            <p style="font-size:20px;font-weight:700;color:#1a1a2e;margin-top:4px;">${formatCurrency(ivaBilled)}</p>
          </div>
          <div style="flex:1;min-width:140px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;text-align:center;">
            <p style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">Total Orçamentado</p>
            <p style="font-size:20px;font-weight:700;color:#1a1a2e;margin-top:4px;">${formatCurrency(totalBilled)}</p>
          </div>
          <div style="flex:1;min-width:140px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;text-align:center;">
            <p style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">Total Pago</p>
            <p style="font-size:20px;font-weight:700;color:#16a34a;margin-top:4px;">${formatCurrency(totalPaid)}</p>
          </div>
          <div style="flex:1;min-width:140px;background:${outstanding > 0 ? "#fef2f2;border:1px solid #fecaca" : "#f0fdf4;border:1px solid #bbf7d0"};border-radius:8px;padding:16px;text-align:center;">
            <p style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:1px;">Saldo em Aberto</p>
            <p style="font-size:20px;font-weight:700;color:${outstanding > 0 ? "#dc2626" : "#16a34a"};margin-top:4px;">${formatCurrency(outstanding)}</p>
          </div>
        </div>

        <h3 style="font-size:15px;font-weight:700;margin-bottom:12px;color:#1a1a2e;">Orçamentos</h3>
        <table style="width:100%;border-collapse:collapse;margin-bottom:30px;">
          <thead>
            <tr style="background:#1e40af;color:#fff;">
              <th style="padding:8px 12px;text-align:left;font-size:12px;font-weight:600;">Nº</th>
              <th style="padding:8px 12px;text-align:center;font-size:12px;font-weight:600;">Emissão</th>
              <th style="padding:8px 12px;text-align:center;font-size:12px;font-weight:600;">Vencimento</th>
              <th style="padding:8px 12px;text-align:right;font-size:12px;font-weight:600;">Subtotal</th>
              <th style="padding:8px 12px;text-align:center;font-size:12px;font-weight:600;">IVA</th>
              <th style="padding:8px 12px;text-align:right;font-size:12px;font-weight:600;">Total</th>
              <th style="padding:8px 12px;text-align:right;font-size:12px;font-weight:600;">Pago</th>
              <th style="padding:8px 12px;text-align:right;font-size:12px;font-weight:600;">Em Aberto</th>
            </tr>
          </thead>
          <tbody>${invoiceRows || '<tr><td colspan="8" style="padding:12px;text-align:center;color:#6b7280;font-size:13px;">Sem orçamentos</td></tr>'}</tbody>
        </table>

        <h3 style="font-size:15px;font-weight:700;margin-bottom:12px;color:#1a1a2e;">Historial de Pagamentos</h3>
        <table style="width:100%;border-collapse:collapse;margin-bottom:30px;">
          <thead>
            <tr style="background:#1e40af;color:#fff;">
              <th style="padding:8px 12px;text-align:left;font-size:12px;font-weight:600;">Data</th>
              <th style="padding:8px 12px;text-align:center;font-size:12px;font-weight:600;">Orçamento</th>
              <th style="padding:8px 12px;text-align:center;font-size:12px;font-weight:600;">Método</th>
              <th style="padding:8px 12px;text-align:right;font-size:12px;font-weight:600;">Valor</th>
            </tr>
          </thead>
          <tbody>${paymentRows || '<tr><td colspan="4" style="padding:12px;text-align:center;color:#6b7280;font-size:13px;">Sem pagamentos</td></tr>'}</tbody>
        </table>

        <div style="margin-top:50px;padding-top:20px;border-top:1px solid #e5e7eb;text-align:center;">
          <p style="font-size:11px;color:#9ca3af;">${BRAND_NAME} · Extrato gerado automaticamente em ${today}</p>
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
