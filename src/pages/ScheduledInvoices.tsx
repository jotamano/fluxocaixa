import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  CalendarClock,
  Zap,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  useSubscriptions,
  useAllSubscriptionItems,
  useGenerateInvoiceNow,
  useGenerateSubscriptionInvoices,
  useCronInvoiceStatus,
  type Subscription,
} from "@/hooks/use-data";
import { formatCurrency, frequencyLabels, getClientLabel, getAmountWithIva } from "@/lib/data";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const todayISO = () => new Date().toISOString().split("T")[0];

function humanSchedule(schedule: string | undefined): string {
  if (!schedule) return "—";
  if (schedule === "30 * * * *") return "De hora a hora";
  return schedule;
}

export default function ScheduledInvoices() {
  const { data: subscriptions = [] } = useSubscriptions();
  const { data: items = [] } = useAllSubscriptionItems();
  const { data: cron, isLoading: cronLoading } = useCronInvoiceStatus();
  const generateNow = useGenerateInvoiceNow();
  const generateAll = useGenerateSubscriptionInvoices();

  const [confirm, setConfirm] = useState<Subscription | null>(null);

  // Projected (recurring + addon) amount per subscription, with the
  // subscription's own IVA applied so the figure matches the invoice.
  const projectedBySub = useMemo(() => {
    const net = new Map<string, number>();
    for (const it of items) {
      if (it.kind === "recurring" || it.kind === "addon") {
        net.set(it.subscription_id, (net.get(it.subscription_id) ?? 0) + Number(it.amount));
      }
    }
    return net;
  }, [items]);

  const today = todayISO();

  const scheduled = useMemo(() => {
    return subscriptions
      .filter((s) => s.status === "active")
      .slice()
      .sort((a, b) => a.next_billing_date.localeCompare(b.next_billing_date));
  }, [subscriptions]);

  const overdueCount = scheduled.filter((s) => s.next_billing_date <= today).length;

  const handleGenerate = async (sub: Subscription) => {
    try {
      const id = await generateNow.mutateAsync(sub.id);
      if (id) {
        toast.success(`Fatura gerada para ${getClientLabel(sub)} — ${sub.name}`);
      } else {
        toast.error("Não foi possível gerar (subscrição inativa ou removida).");
      }
    } catch (e) {
      toast.error(`Erro ao gerar fatura: ${(e as Error).message}`);
    } finally {
      setConfirm(null);
    }
  };

  const handleGenerateAll = async () => {
    try {
      const n = await generateAll.mutateAsync();
      toast.success(n > 0 ? `${n} fatura(s) em atraso geradas.` : "Não havia faturas pendentes.");
    } catch (e) {
      toast.error(`Erro: ${(e as Error).message}`);
    }
  };

  const cronFailed = cron?.last_status && cron.last_status !== "succeeded";

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold font-display text-foreground">Faturas agendadas</h1>
          <p className="mt-1 text-muted-foreground">
            Próximas faturas que o cron vai gerar a partir das subscrições ativas. Podes antecipar ou regenerar qualquer uma num clique.
          </p>
        </div>
        <Button
          onClick={handleGenerateAll}
          disabled={generateAll.isPending}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${generateAll.isPending ? "animate-spin" : ""}`} />
          Gerar pendentes agora
        </Button>
      </div>

      {/* Cron status */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="h-4 w-4 text-primary" />
            Estado do agendamento automático
          </CardTitle>
          <CardDescription>
            O servidor corre o gerador automaticamente e, se estiver desligado a uma execução, apanha o atraso assim que voltar a ligar.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Frequência</p>
            <p className="text-sm font-medium">
              {cronLoading ? "…" : humanSchedule(cron?.schedule)}
              {cron && !cron.active && <Badge variant="destructive" className="ml-2">inativo</Badge>}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Última execução</p>
            <p className="text-sm font-medium">
              {cron?.last_run_started
                ? new Date(cron.last_run_started).toLocaleString("pt-PT")
                : "Ainda sem registo"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Resultado</p>
            <p className="text-sm font-medium flex items-center gap-1.5">
              {!cron?.last_status && <span className="text-muted-foreground">—</span>}
              {cron?.last_status === "succeeded" && (
                <>
                  <CheckCircle2 className="h-4 w-4 text-success" /> Sucesso
                </>
              )}
              {cronFailed && (
                <>
                  <AlertTriangle className="h-4 w-4 text-destructive" /> {cron?.last_status}
                </>
              )}
            </p>
          </div>
          {cronFailed && cron?.last_message && (
            <div className="sm:col-span-3 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {cron.last_message}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Scheduled list */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Próximas faturas ({scheduled.length})
            {overdueCount > 0 && (
              <Badge variant="destructive" className="ml-2">{overdueCount} em atraso</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {scheduled.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-muted-foreground">
              Não há subscrições ativas — nada agendado.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {scheduled.map((sub) => {
                const overdue = sub.next_billing_date <= today;
                const net = projectedBySub.get(sub.id) ?? 0;
                const gross = getAmountWithIva(net, sub);
                return (
                  <div
                    key={sub.id}
                    className="flex flex-col gap-3 px-4 py-4 md:px-6 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Link
                          to={`/subscricoes/${sub.id}`}
                          className="text-sm font-medium text-card-foreground hover:underline inline-flex items-center gap-1"
                        >
                          {sub.name}
                          <ExternalLink className="h-3 w-3 opacity-60" />
                        </Link>
                        <Badge variant={overdue ? "destructive" : "secondary"}>
                          {overdue ? "Em atraso" : "Agendada"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {getClientLabel(sub)} · {frequencyLabels[sub.frequency]} ·{" "}
                        {new Date(sub.next_billing_date).toLocaleDateString("pt-PT")}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 sm:gap-4">
                      <span className="text-sm font-semibold tabular-nums">{formatCurrency(gross)}</span>
                      <Button
                        size="sm"
                        variant={overdue ? "default" : "outline"}
                        className="gap-1.5"
                        disabled={generateNow.isPending}
                        onClick={() => setConfirm(sub)}
                      >
                        <Zap className="h-3.5 w-3.5" />
                        Gerar agora
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Gerar fatura agora?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm && (
                <>
                  Vai criar já a próxima fatura de <strong>{confirm.name}</strong> ({getClientLabel(confirm)})
                  com data prevista {new Date(confirm.next_billing_date).toLocaleDateString("pt-PT")}, e a
                  próxima data de faturação avança um período. A fatura fica em <em>pendente</em> e podes editá-la
                  ou apagá-la normalmente.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirm && handleGenerate(confirm)}>
              Gerar agora
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
