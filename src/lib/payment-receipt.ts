import type { Client, Invoice, Payment } from "@/hooks/use-data";
import { formatCurrency, methodLabels } from "./data";
import { BRAND_NAME, brandHeaderBlock } from "./branding";
import { openDocumentPreview } from "./document-preview";

const escapeHtml = (value: string) => value
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/\"/g, "&quot;")
  .replace(/'/g, "&#039;");

const safe = (value?: string | null) => escapeHtml(value?.trim() || "—");
const date = (value?: string | null) => value ? new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-PT") : "—";

export function generatePaymentReceipt(payment: Payment, client?: Client, invoice?: Invoice) {
  const amount = formatCurrency(Number(payment.amount));
  const clientName = client?.name || "Cliente";
  const html = `
    <!DOCTYPE html>
    <html lang="pt-PT">
      <head>
        <meta charset="utf-8">
        <title>Recibo de pagamento — ${safe(payment.id.slice(0, 8))}</title>
        <style>
          @page { size: A4; margin: 0; }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { margin: 0; font-family: 'Segoe UI', system-ui, sans-serif; color: #172033; background: #e9eef5; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .page { width: 210mm; height: 297mm; margin: 0 auto; padding: 48px 52px 40px; background: #fff; position: relative; overflow: hidden; }
          .page:before { content: ''; position: absolute; inset: 0 0 auto; height: 8px; background: linear-gradient(90deg, #183b73, #2563a8 58%, #38b3a0); }
          .header { display: flex; justify-content: space-between; gap: 30px; align-items: flex-start; padding-top: 8px; }
          .header-right { text-align: right; }
          .kicker { color: #6b7890; font-size: 10px; font-weight: 800; letter-spacing: .16em; text-transform: uppercase; }
          h1 { margin-top: 6px; color: #102a52; font-size: 30px; line-height: 1; letter-spacing: -.04em; }
          .date { margin-top: 9px; color: #6b7890; font-size: 11px; }
          .card { margin-top: 32px; padding: 20px; border: 1px solid #e3eaf3; border-radius: 14px; background: #f8fafc; }
          .card-label { color: #7b879a; font-size: 9px; font-weight: 850; letter-spacing: .13em; text-transform: uppercase; }
          .client-name { margin-top: 8px; color: #102a52; font-size: 18px; font-weight: 800; }
          .line { margin-top: 4px; color: #59677b; font-size: 11px; line-height: 1.45; }
          .summary { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 18px; }
          .summary-card { padding: 17px 18px; border: 1px solid #dbe5f0; border-radius: 13px; }
          .summary-card.amount { border-color: #cfe4e3; background: #eff8f7; }
          .summary-value { margin-top: 8px; color: #172033; font-size: 20px; font-weight: 800; }
          .amount .summary-value { color: #1f5d63; font-size: 26px; }
          .details { margin-top: 28px; border: 1px solid #e3eaf3; border-radius: 14px; overflow: hidden; }
          .detail-row { display: flex; justify-content: space-between; gap: 20px; padding: 14px 17px; font-size: 11px; }
          .detail-row + .detail-row { border-top: 1px solid #e8edf4; }
          .detail-label { color: #7b879a; }
          .detail-value { color: #172033; font-weight: 750; text-align: right; }
          .notes { margin-top: 24px; padding: 16px 17px; border: 1px solid #e3eaf3; border-radius: 12px; background: #fbfcfe; }
          .notes p { margin-top: 7px; color: #66748a; font-size: 10.5px; line-height: 1.55; white-space: pre-line; }
          .footer { margin-top: 70px; padding-top: 18px; border-top: 1px solid #dfe7f0; color: #8793a5; font-size: 9px; line-height: 1.5; text-align: center; }
          .footer strong { display: block; color: #526078; font-size: 10px; }
          @media print { body { background: #fff; } .page { break-after: avoid-page; page-break-after: avoid; } }
        </style>
      </head>
      <body>
        <main class="page" data-document-page>
          <header class="header">
            <div>${brandHeaderBlock()}</div>
            <div class="header-right"><p class="kicker">Comprovativo</p><h1>RECIBO</h1><p class="date">Emitido em ${date(payment.date)}</p></div>
          </header>
          <section class="card"><p class="card-label">Recebido de</p><p class="client-name">${safe(clientName)}</p></section>
          <section class="summary"><div class="summary-card amount"><p class="card-label">Montante recebido</p><p class="summary-value">${amount}</p></div><div class="summary-card"><p class="card-label">Método de pagamento</p><p class="summary-value">${safe(methodLabels[payment.method])}</p></div></section>
          <section class="details"><div class="detail-row"><span class="detail-label">Data do pagamento</span><span class="detail-value">${date(payment.date)}</span></div><div class="detail-row"><span class="detail-label">Fatura associada</span><span class="detail-value">${safe(invoice?.number || "Pagamento avulso")}</span></div><div class="detail-row"><span class="detail-label">Identificador do registo</span><span class="detail-value">${safe(payment.id)}</span></div></section>
          ${payment.notes ? `<section class="notes"><p class="card-label">Notas</p><p>${safe(payment.notes)}</p></section>` : ""}
          <footer class="footer"><strong>${BRAND_NAME} · Recibo gerado automaticamente</strong>Este documento confirma o registo do pagamento na aplicação.</footer>
        </main>
      </body>
    </html>
  `;
  openDocumentPreview({ title: `Recibo de pagamento — ${clientName}`, html });
}
