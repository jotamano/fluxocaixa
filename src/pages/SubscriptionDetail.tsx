import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Pencil, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useSubscription,
  useSubscriptionItems,
  useSubscriptionInvoices,
  useSubscriptionPriceHistory,
} from "@/hooks/use-data";
import type { SubscriptionItem } from "@/hooks/use-data";
import { formatCurrency, frequencyLabels, getClientLabel, getEffectiveIvaPercentage, getInvoiceTotalWithIva, getAmountWithIva } from "@/lib/data";
import { StatusBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";

const KIND_LABELS: Record<SubscriptionItem["kind"], string> = {
  recurring: "Recorrente",
  setup: "Setup (uma vez)",
  addon: "Add-on",
};

export default function SubscriptionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: sub } = useSubscription(id);
  const { data: items = [] } = useSubscriptionItems(id);
  const { data: invoices = [] } = useSubscriptionInvoices(id);
  const { data: priceHistory = [] } = useSubscriptionPriceHistory(id);

  if (!sub) {
    return <div className="p-8 text-muted-foreground">A carregar…</div>;
  }

  const total = items.reduce((sum, it) => sum + (it.kind === "recurring" || it.kind === "addon" ? Number(it.amount) : 0), 0);
  const setupTotal = items.filter(it => it.kind === "setup").reduce((sum, it) => sum + Number(it.amount), 0);
  const ivaPct = getEffectiveIvaPercentage(sub);
  const totalWithIva = getAmountWithIva(total, sub);
  const setupTotalWithIva = getAmountWithIva(setupTotal, sub);
  const ivaAmount = totalWithIva - total;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-1">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
        <Link to={`/subscricoes?edit=${sub.id}`}>
          <Button variant="outline" className="gap-2"><Pencil className="h-4 w-4" /> Editar subscrição</Button>
        </Link>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 shadow-card">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground">{sub.name}</h1>
            <p className="text-sm text-muted-foreground">
              <Link to={`/clientes/${sub.client_id}`} className="hover:underline">{getClientLabel(sub)}</Link>
              {sub.clients?.company && sub.clients?.name ? ` · ${sub.clients.name}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={ivaPct > 0 ? "secondary" : "outline"} className="text-[10px]">
              {ivaPct > 0 ? `IVA ${ivaPct}%` : "Sem IVA"}
            </Badge>
            <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold border ${
              sub.status === "active" ? 'bg-success/10 text-success border-success/20'
              : sub.status === "paused" ? 'bg-warning/10 text-warning border-warning/20'
              : 'bg-muted text-muted-foreground border-border'
            }`}>
              {sub.status === "active" ? "Ativa" : sub.status === "paused" ? "Pausada" : "Cancelada"}
            </span>
          </div>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <Stat
            label="Mensalidade"
            value={formatCurrency(totalWithIva)}
            suffix={`/${frequencyLabels[sub.frequency].toLowerCase()}`}
            hint={ivaPct > 0 ? `${formatCurrency(total)} + IVA ${ivaPct}%` : undefined}
          />
          <Stat
            label="Setup pendente"
            value={formatCurrency(setupTotalWithIva)}
            hint={ivaPct > 0 && setupTotal > 0 ? `${formatCurrency(setupTotal)} + IVA ${ivaPct}%` : undefined}
          />
          <Stat label="Próxima faturação" value={new Date(sub.next_billing_date).toLocaleDateString('pt-PT')} />
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 shadow-card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-semibold text-foreground">Itens</h2>
          <p className="text-xs text-muted-foreground">
            Para alterar valores ou nome, usa o botão <span className="font-medium">Editar subscrição</span>.
          </p>
        </div>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem itens.</p>
        ) : (
          <div className="space-y-2">
            {items.map((it) => (
              <div key={it.id} className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-card-foreground">{it.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {KIND_LABELS[it.kind]}
                    {it.kind === "setup" && it.invoiced_at ? " · já faturado" : ""}
                  </p>
                </div>
                <span className="text-sm font-semibold">{formatCurrency(Number(it.amount))}</span>
              </div>
            ))}
            {ivaPct > 0 && total > 0 && (
              <div className="mt-3 rounded-lg border border-border bg-muted/40 px-4 py-3 space-y-1 text-sm">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Subtotal recorrente / {frequencyLabels[sub.frequency].toLowerCase()}</span>
                  <span>{formatCurrency(total)}</span>
                </div>
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>IVA {ivaPct}%</span>
                  <span>{formatCurrency(ivaAmount)}</span>
                </div>
                <div className="flex items-center justify-between border-t border-border pt-1 mt-1 font-semibold text-foreground">
                  <span>Total c/ IVA</span>
                  <span>{formatCurrency(totalWithIva)}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-6 shadow-card">
        <h2 className="font-display font-semibold text-foreground mb-4">Faturas geradas ({invoices.length})</h2>
        {invoices.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem faturas geradas a partir desta subscrição.</p>
        ) : (
          <div className="space-y-2">
            {invoices.map((inv) => {
              const totalInv = getInvoiceTotalWithIva(inv.invoice_items ?? [], inv);
              return (
                <Link key={inv.id} to={`/faturas/${inv.id}`} className="flex items-center justify-between rounded-lg border border-border px-4 py-3 hover:bg-muted/40 transition-colors">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium text-card-foreground">{inv.number}</p>
                    <p className="text-xs text-muted-foreground">Emitida {new Date(inv.issue_date).toLocaleDateString('pt-PT')}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={inv.status} />
                    <span className="text-sm font-semibold">{formatCurrency(totalInv)}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-6 shadow-card">
        <h2 className="font-display font-semibold text-foreground mb-4 flex items-center gap-2">
          <History className="h-4 w-4" /> Histórico de preços
        </h2>
        {priceHistory.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem histórico de preços.</p>
        ) : (
          <div className="space-y-2">
            {priceHistory.map((h) => (
              <div key={h.id} className="flex items-center justify-between rounded-lg border border-border px-4 py-2">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">{formatCurrency(Number(h.amount))}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(h.valid_from).toLocaleDateString('pt-PT')} → {h.valid_to ? new Date(h.valid_to).toLocaleDateString('pt-PT') : "atual"}
                    {h.reason ? ` · ${h.reason}` : ""}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, suffix, hint }: { label: string; value: string; suffix?: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold text-foreground">{value}{suffix && <span className="text-xs text-muted-foreground ml-1">{suffix}</span>}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
