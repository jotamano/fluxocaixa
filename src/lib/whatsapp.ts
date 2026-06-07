import type { AppSettings, Invoice } from "@/hooks/use-data";
import { formatCurrency, getInvoiceTotalWithIva } from "@/lib/data";

// Renders a "YYYY-MM-DD" (or ISO) date as DD/MM/YYYY without touching the
// timezone — invoice dates are plain calendar dates.
function formatDatePt(date: string | null | undefined): string {
  if (!date) return "";
  const [y, m, d] = date.split("T")[0].split("-");
  if (!y || !m || !d) return date;
  return `${d}/${m}/${y}`;
}

// Expands the message template with the invoice/client data. Mirrors the
// placeholders the old server-side sender supported. Falls back from
// company → name → "Cliente" for the human label.
export function renderInvoiceMessage(template: string, invoice: Invoice): string {
  const client = invoice.clients;
  const company = client?.company?.trim() ?? "";
  const name = client?.name?.trim() ?? "";
  const label = company || name || "Cliente";
  const gross = getInvoiceTotalWithIva(invoice.invoice_items ?? [], invoice);

  return template
    .split("{cliente}").join(label)
    .split("{empresa}").join(company || label)
    .split("{nome}").join(name || label)
    .split("{numero}").join(invoice.number)
    .split("{valor}").join(formatCurrency(gross))
    .split("{vencimento}").join(formatDatePt(invoice.due_date))
    .split("{emissao}").join(formatDatePt(invoice.issue_date));
}

// Thrown when the invoice can't be sent for a config/recipient reason the
// user can fix (vs. a transient network/hub error). Callers can treat these
// as "skip silently" during auto-send.
export class WhatsAppSkip extends Error {}

// Sends the invoice summary to the hub from the browser. The hub URL must be
// reachable from the browser (public URL, not the internal docker name).
// Resolves on success; throws on any failure (WhatsAppSkip for config issues).
export async function sendInvoiceToHub(settings: AppSettings | null, invoice: Invoice): Promise<void> {
  if (!settings || settings.whatsapp_enabled !== true) {
    throw new WhatsAppSkip("WhatsApp desativado nas Configurações.");
  }
  const hubUrl = settings.whatsapp_hub_url?.trim();
  const apiKey = settings.whatsapp_api_key?.trim();
  const instance = settings.whatsapp_instance?.trim();
  if (!hubUrl || !apiKey || !instance) {
    throw new WhatsAppSkip("Configuração do WhatsApp Hub incompleta (URL, API key e instância).");
  }
  const to = invoice.clients?.whatsapp_group_jid?.trim();
  if (!to) {
    throw new WhatsAppSkip("Cliente sem grupo de WhatsApp definido.");
  }

  const text = renderInvoiceMessage(settings.whatsapp_message_template, invoice);
  const url = `${hubUrl.replace(/\/+$/, "")}/v1/messages`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({ instanceName: instance, to, text }),
    });
  } catch {
    throw new Error(
      "Não consegui contactar o WhatsApp Hub. Confirma que a URL nas Configurações é acessível pelo browser (URL pública).",
    );
  }
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error("API key inválida ou sem permissão no WhatsApp Hub.");
    }
    if (res.status === 404) {
      throw new Error("Instância não encontrada no WhatsApp Hub, ou endpoint /v1/messages indisponível.");
    }
    let detail = "";
    try {
      detail = (await res.text()).slice(0, 200);
    } catch {
      /* ignore */
    }
    throw new Error(`O WhatsApp Hub respondeu com erro ${res.status}.${detail ? ` ${detail}` : ""}`);
  }
}
