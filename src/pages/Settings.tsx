import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Settings as SettingsIcon, MessageCircle, CalendarClock, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  DEFAULT_BILLING_ANCHOR_OFFSET_DAYS,
  useAppSettings,
  useUpdateAppSettings,
} from "@/hooks/use-data";

// Hard cap mirrors the CHECK constraint in the migration
// (20260508140000_app_settings.sql). A wider range would let a typo
// shift the entire billing cycle by years, which we don't want — and
// keeping the limits in lockstep with the DB keeps the user-facing
// error message clean instead of falling back to a 23514 raw SQL
// violation surfaced by PostgREST.
const OFFSET_MIN = -365;
const OFFSET_MAX = 365;

function explainOffset(offset: number): string {
  if (offset === 0) {
    return "A próxima fatura é emitida no mesmo dia em que termina o serviço atual.";
  }
  if (offset === 1) {
    return "A próxima fatura é emitida no dia seguinte ao fim do serviço (comportamento padrão).";
  }
  if (offset > 0) {
    return `A próxima fatura é emitida ${offset} dias após o fim do serviço.`;
  }
  return `A próxima fatura é emitida ${Math.abs(offset)} dia(s) antes do fim do serviço.`;
}

const DEFAULT_WA_TEMPLATE =
  "Olá {cliente}! 👋\n\nFoi emitida a fatura {numero} no valor de {valor}, com vencimento a {vencimento}.\n\nObrigado!";

export default function Settings() {
  const { toast } = useToast();
  const { data: settings, isLoading, error } = useAppSettings();
  const updateMutation = useUpdateAppSettings();

  // Keep the input as a string so the user can clear the field and
  // type a leading "-" without React snapping it back to 0 mid-edit.
  // The persisted value is parsed at submit time.
  const [offsetInput, setOffsetInput] = useState<string>("");

  useEffect(() => {
    if (settings) {
      setOffsetInput(String(settings.billing_anchor_offset_days));
    } else if (!isLoading && !error) {
      setOffsetInput(String(DEFAULT_BILLING_ANCHOR_OFFSET_DAYS));
    }
  }, [settings, isLoading, error]);

  const parsed = Number.parseInt(offsetInput, 10);
  const isValid =
    Number.isFinite(parsed) && parsed >= OFFSET_MIN && parsed <= OFFSET_MAX;
  const dirty = settings ? parsed !== settings.billing_anchor_offset_days : true;
  const previewOffset = isValid ? parsed : DEFAULT_BILLING_ANCHOR_OFFSET_DAYS;

  // ── WhatsApp / Evolution hub config ──────────────────────────────
  const [wa, setWa] = useState({
    enabled: false,
    hub_url: "",
    api_key: "",
    instance: "",
    auto_send: false,
    template: DEFAULT_WA_TEMPLATE,
  });

  useEffect(() => {
    if (!settings) return;
    setWa({
      enabled: settings.whatsapp_enabled ?? false,
      hub_url: settings.whatsapp_hub_url ?? "",
      api_key: settings.whatsapp_api_key ?? "",
      instance: settings.whatsapp_instance ?? "",
      auto_send: settings.whatsapp_auto_send ?? false,
      template: settings.whatsapp_message_template ?? DEFAULT_WA_TEMPLATE,
    });
  }, [settings]);

  const handleSaveWhatsApp = async () => {
    try {
      await updateMutation.mutateAsync({
        whatsapp_enabled: wa.enabled,
        whatsapp_hub_url: wa.hub_url.trim() || null,
        whatsapp_api_key: wa.api_key.trim() || null,
        whatsapp_instance: wa.instance.trim() || null,
        whatsapp_auto_send: wa.auto_send,
        whatsapp_message_template: wa.template,
      });
      toast({ title: "WhatsApp guardado", description: "A configuração de envio foi atualizada." });
    } catch (err) {
      toast({
        title: "Erro a guardar",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isValid) {
      toast({
        title: "Valor inválido",
        description: `O ajuste tem de ser um número inteiro entre ${OFFSET_MIN} e ${OFFSET_MAX}.`,
        variant: "destructive",
      });
      return;
    }
    try {
      await updateMutation.mutateAsync({ billing_anchor_offset_days: parsed });
      toast({
        title: "Configuração guardada",
        description: explainOffset(parsed),
      });
    } catch (err) {
      toast({
        title: "Erro a guardar",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold font-display text-foreground">
          <SettingsIcon className="h-7 w-7" /> Configurações
        </h1>
        <p className="mt-1 text-muted-foreground">
          Ajustes globais que afetam toda a aplicação. Aplicam-se de imediato a todos os membros.
        </p>
      </div>

      {error && (
        <Card>
          <CardContent className="py-6 text-sm text-destructive">
            Erro a carregar configurações:{" "}
            {error instanceof Error ? error.message : String(error)}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Faturação</CardTitle>
          <CardDescription>
            Controla quando a próxima fatura é emitida em relação ao fim do período de serviço
            anterior. Aplica-se sempre que editas as datas de uma linha numa fatura ligada a uma
            subscrição (ou vice-versa).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4 max-w-xl">
            <div className="space-y-2">
              <Label htmlFor="billing-offset">Ajuste em dias</Label>
              <Input
                id="billing-offset"
                type="number"
                inputMode="numeric"
                step={1}
                min={OFFSET_MIN}
                max={OFFSET_MAX}
                value={offsetInput}
                onChange={e => setOffsetInput(e.target.value)}
                disabled={isLoading || updateMutation.isPending}
                className="max-w-[12rem]"
              />
              <p className="text-xs text-muted-foreground">
                Valores negativos emitem a fatura <strong>antes</strong> do fim do serviço; zero
                emite no <strong>mesmo dia</strong>; positivos emitem <strong>depois</strong>.
                Padrão da aplicação: <code>+1</code>.
              </p>
            </div>

            <div className="rounded-lg border border-dashed border-border bg-muted/40 px-4 py-3">
              <p className="text-sm font-medium text-card-foreground">
                Pré-visualização: {explainOffset(previewOffset)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Exemplo: serviço termina a 11/05/2026 → próxima faturação{" "}
                <code>{previewExampleDate(previewOffset)}</code>.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="submit"
                disabled={!isValid || !dirty || isLoading || updateMutation.isPending}
              >
                {updateMutation.isPending ? "A guardar…" : "Guardar"}
              </Button>
              {settings && dirty && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setOffsetInput(String(settings.billing_anchor_offset_days))}
                  disabled={updateMutation.isPending}
                >
                  Cancelar
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* WhatsApp / Evolution hub */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5" /> Envio por WhatsApp
          </CardTitle>
          <CardDescription>
            Envia as faturas para um grupo de WhatsApp por cliente, através do teu
            WhatsApp Hub (Evolution). O envio é feito a partir do <strong>browser</strong>
            (com a app aberta), por isso a URL do hub tem de ser acessível pelo teu
            navegador. O grupo de cada cliente define-se na ficha do cliente (campo{" "}
            <strong>Grupo WhatsApp (JID)</strong>).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 max-w-xl">
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
            <div>
              <Label className="text-sm">Ativar envio por WhatsApp</Label>
              <p className="text-xs text-muted-foreground">
                Liga a integração. Sem isto, o botão e o auto-envio ficam inativos.
              </p>
            </div>
            <Switch
              checked={wa.enabled}
              onCheckedChange={v => setWa(prev => ({ ...prev, enabled: v }))}
              disabled={isLoading || updateMutation.isPending}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="wa-url">URL do WhatsApp Hub</Label>
            <Input
              id="wa-url"
              placeholder="https://hub.exemplo.pt"
              value={wa.hub_url}
              onChange={e => setWa(prev => ({ ...prev, hub_url: e.target.value }))}
              disabled={isLoading || updateMutation.isPending}
            />
            <p className="text-xs text-muted-foreground">
              Base da API pública do hub (sem <code>/v1/messages</code>). Como o envio sai do
              browser, usa a URL <strong>pública/acessível pelo navegador</strong> (ex.:{" "}
              <code>https://hub.exemplo.pt</code> ou <code>http://192.168.2.46:3010</code>) —
              <strong> não</strong> o nome interno do serviço no Coolify.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="wa-key">API key</Label>
            <Input
              id="wa-key"
              type="password"
              placeholder="whk_..."
              value={wa.api_key}
              onChange={e => setWa(prev => ({ ...prev, api_key: e.target.value }))}
              disabled={isLoading || updateMutation.isPending}
            />
            <p className="text-xs text-muted-foreground">
              Chave da API pública do hub (cabeçalho <code>x-api-key</code>), começa por <code>whk_</code>.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="wa-instance">Instância</Label>
            <Input
              id="wa-instance"
              placeholder="principal"
              value={wa.instance}
              onChange={e => setWa(prev => ({ ...prev, instance: e.target.value }))}
              disabled={isLoading || updateMutation.isPending}
            />
            <p className="text-xs text-muted-foreground">
              Nome da instância (número) configurada no hub que vai enviar as mensagens.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="wa-template">Mensagem</Label>
            <Textarea
              id="wa-template"
              rows={5}
              value={wa.template}
              onChange={e => setWa(prev => ({ ...prev, template: e.target.value }))}
              disabled={isLoading || updateMutation.isPending}
            />
            <p className="text-xs text-muted-foreground">
              Variáveis disponíveis: <code>{"{cliente}"}</code>, <code>{"{empresa}"}</code>,{" "}
              <code>{"{nome}"}</code>, <code>{"{numero}"}</code>, <code>{"{valor}"}</code>,{" "}
              <code>{"{vencimento}"}</code>, <code>{"{emissao}"}</code>.
            </p>
          </div>

          <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
            <div>
              <Label className="text-sm">Auto-envio das faturas por enviar</Label>
              <p className="text-xs text-muted-foreground">
                Sempre que abres a app, envia automaticamente (só texto) as faturas ainda{" "}
                <strong>por enviar</strong> dos clientes com grupo definido. As faturas geradas
                pelo agendador ficam marcadas com o aviso <em>“WhatsApp por enviar”</em> até serem
                enviadas (aqui automaticamente, ou no botão da fatura).
              </p>
            </div>
            <Switch
              checked={wa.auto_send}
              onCheckedChange={v => setWa(prev => ({ ...prev, auto_send: v }))}
              disabled={isLoading || updateMutation.isPending}
            />
          </div>

          <Button onClick={handleSaveWhatsApp} disabled={isLoading || updateMutation.isPending}>
            {updateMutation.isPending ? "A guardar…" : "Guardar WhatsApp"}
          </Button>
        </CardContent>
      </Card>

      {/* Shortcut to the scheduled-invoices operational page */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5" /> Faturas agendadas
          </CardTitle>
          <CardDescription>
            Vê as próximas faturas que o agendador vai gerar, antecipa ou regenera qualquer uma,
            e confirma o estado da última execução automática.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" className="gap-2">
            <Link to="/faturas-agendadas">
              Abrir faturas agendadas <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function previewExampleDate(offsetDays: number): string {
  const anchor = new Date("2026-05-11T00:00:00Z");
  anchor.setUTCDate(anchor.getUTCDate() + offsetDays);
  return anchor.toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
}
