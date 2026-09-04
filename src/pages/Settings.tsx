import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Settings as SettingsIcon, MessageCircle, CalendarClock, ArrowRight, Building2 } from "lucide-react";
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
  const [issuer, setIssuer] = useState({
    name: "",
    address: "",
    tax_id: "",
    country: "Portugal",
    email: "",
    phone: "",
    registration_number: "",
    bank_details: "",
    logo_url: "",
    invoice_tax_label: "Tratamento de IVA a confirmar",
    invoice_tax_note: "O tratamento de IVA deve ser confirmado para o tipo de serviço, o estatuto fiscal do cliente e o local de tributação aplicável.",
    invoice_payment_terms: "Pagamento até 30 dias após a data de emissão.",
    invoice_footer_note: "Documento comercial. Confirma o enquadramento fiscal aplicável antes da emissão final.",
  });
  const issuerLoaded = useRef(false);

  useEffect(() => {
    if (settings) {
      setOffsetInput(String(settings.billing_anchor_offset_days));
    } else if (!isLoading && !error) {
      setOffsetInput(String(DEFAULT_BILLING_ANCHOR_OFFSET_DAYS));
    }
  }, [settings, isLoading, error]);

  useEffect(() => {
    if (!settings || issuerLoaded.current) return;
    issuerLoaded.current = true;
    setIssuer({
      name: settings.georgia_company_name ?? "",
      address: settings.georgia_company_address ?? "",
      tax_id: settings.georgia_company_tax_id ?? "",
      country: settings.georgia_company_country ?? "Portugal",
      email: settings.georgia_company_email ?? "",
      phone: settings.georgia_company_phone ?? "",
      registration_number: settings.georgia_company_registration_number ?? "",
      bank_details: settings.georgia_company_bank_details ?? "",
      logo_url: settings.georgia_company_logo_url ?? "",
      invoice_tax_label: settings.georgia_invoice_tax_label ?? "Tratamento de IVA a confirmar",
      invoice_tax_note: settings.georgia_invoice_tax_note ?? "O tratamento de IVA deve ser confirmado para o tipo de serviço, o estatuto fiscal do cliente e o local de tributação aplicável.",
      invoice_payment_terms: settings.georgia_invoice_payment_terms ?? "Pagamento até 30 dias após a data de emissão.",
      invoice_footer_note: settings.georgia_invoice_footer_note ?? "Documento comercial. Confirma o enquadramento fiscal aplicável antes da emissão final.",
    });
  }, [settings]);

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

  const handleSaveIssuer = async (e?: React.FormEvent<HTMLFormElement>) => {
    e?.preventDefault();
    if (!issuer.name.trim() || !issuer.address.trim() || !issuer.tax_id.trim()) {
      toast({
        title: "Dados incompletos",
        description: "Preenche pelo menos o nome legal, a morada e o NIF da empresa.",
        variant: "destructive",
      });
      return;
    }

    if (issuer.logo_url.trim()) {
      try {
        const url = new URL(issuer.logo_url.trim());
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
      } catch {
        toast({ title: "URL do logótipo inválida", description: "Introduz um link HTTPS direto para uma imagem.", variant: "destructive" });
        return;
      }
    }

    try {
      await updateMutation.mutateAsync({
        georgia_company_name: issuer.name.trim(),
        georgia_company_address: issuer.address.trim(),
        georgia_company_tax_id: issuer.tax_id.trim(),
        georgia_company_country: issuer.country.trim() || "Portugal",
        georgia_company_email: issuer.email.trim(),
        georgia_company_phone: issuer.phone.trim(),
        georgia_company_registration_number: issuer.registration_number.trim(),
        georgia_company_bank_details: issuer.bank_details.trim(),
        georgia_company_logo_url: issuer.logo_url.trim() || null,
        georgia_invoice_tax_label: issuer.invoice_tax_label.trim(),
        georgia_invoice_tax_note: issuer.invoice_tax_note.trim(),
        georgia_invoice_payment_terms: issuer.invoice_payment_terms.trim(),
        georgia_invoice_footer_note: issuer.invoice_footer_note.trim(),
      });
      toast({ title: "Dados da empresa guardados", description: "O perfil será usado nas próximas Faturas Geórgia." });
    } catch (err) {
      toast({
        title: "Erro a guardar",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    }
  };

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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" /> Empresa emissora — Faturas Geórgia
          </CardTitle>
          <CardDescription>
            Estes dados aparecem como fornecedor nas novas Faturas Geórgia. O nome legal, a morada e o NIF são obrigatórios; os restantes campos ajudam a completar o documento e ficam guardados como histórico na fatura.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 max-w-2xl">
          <form onSubmit={handleSaveIssuer} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="georgia-company-name">Nome legal da empresa *</Label>
              <Input
                id="georgia-company-name"
                value={issuer.name}
                onChange={e => setIssuer(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Nome oficial da empresa"
                disabled={isLoading || updateMutation.isPending}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="georgia-company-address">Morada completa *</Label>
              <Textarea
                id="georgia-company-address"
                rows={3}
                value={issuer.address}
                onChange={e => setIssuer(prev => ({ ...prev, address: e.target.value }))}
                placeholder="Rua, número, código postal, cidade e país"
                disabled={isLoading || updateMutation.isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="georgia-company-tax-id">NIF / identificação fiscal *</Label>
              <Input
                id="georgia-company-tax-id"
                value={issuer.tax_id}
                onChange={e => setIssuer(prev => ({ ...prev, tax_id: e.target.value }))}
                placeholder="PT000000000"
                disabled={isLoading || updateMutation.isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="georgia-company-country">País</Label>
              <Input
                id="georgia-company-country"
                value={issuer.country}
                onChange={e => setIssuer(prev => ({ ...prev, country: e.target.value }))}
                placeholder="Portugal"
                disabled={isLoading || updateMutation.isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="georgia-company-email">Email</Label>
              <Input
                id="georgia-company-email"
                type="email"
                value={issuer.email}
                onChange={e => setIssuer(prev => ({ ...prev, email: e.target.value }))}
                placeholder="faturacao@empresa.pt"
                disabled={isLoading || updateMutation.isPending}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="georgia-company-phone">Telefone</Label>
              <Input
                id="georgia-company-phone"
                value={issuer.phone}
                onChange={e => setIssuer(prev => ({ ...prev, phone: e.target.value }))}
                placeholder="+351 ..."
                disabled={isLoading || updateMutation.isPending}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="georgia-company-registration">Número de registo comercial (opcional)</Label>
              <Input
                id="georgia-company-registration"
                value={issuer.registration_number}
                onChange={e => setIssuer(prev => ({ ...prev, registration_number: e.target.value }))}
                placeholder="Número de registo da empresa"
                disabled={isLoading || updateMutation.isPending}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="georgia-company-bank">Dados de pagamento (opcional)</Label>
              <Textarea
                id="georgia-company-bank"
                rows={3}
                value={issuer.bank_details}
                onChange={e => setIssuer(prev => ({ ...prev, bank_details: e.target.value }))}
                placeholder="IBAN, SWIFT/BIC ou instruções de pagamento"
                disabled={isLoading || updateMutation.isPending}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="georgia-company-logo">Link do logótipo da empresa (opcional)</Label>
              <Input id="georgia-company-logo" type="url" value={issuer.logo_url} onChange={e => setIssuer(prev => ({ ...prev, logo_url: e.target.value }))} placeholder="https://unbreakablesystems.pt/wp-content/uploads/2026/09/logo.png" disabled={isLoading || updateMutation.isPending} />
              {issuer.logo_url && <img src={issuer.logo_url} alt="Pré-visualização do logótipo" className="h-16 max-w-[220px] object-contain" onError={e => { e.currentTarget.style.display = "none"; }} />}
              <p className="text-xs text-muted-foreground">Introduz o URL público direto da imagem (HTTPS). O logótipo aparece no cabeçalho das novas faturas.</p>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="georgia-invoice-tax-label">Título do tratamento fiscal</Label>
              <Input
                id="georgia-invoice-tax-label"
                value={issuer.invoice_tax_label}
                onChange={e => setIssuer(prev => ({ ...prev, invoice_tax_label: e.target.value }))}
                placeholder="Tratamento de IVA a confirmar"
                disabled={isLoading || updateMutation.isPending}
              />
              <p className="text-xs text-muted-foreground">Evita texto fixo como “Reverse Charge”; usa aqui o título adequado ao teu enquadramento, depois de o validares.</p>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="georgia-invoice-tax-note">Nota fiscal apresentada na fatura</Label>
              <Textarea
                id="georgia-invoice-tax-note"
                rows={3}
                value={issuer.invoice_tax_note}
                onChange={e => setIssuer(prev => ({ ...prev, invoice_tax_note: e.target.value }))}
                placeholder="Texto fiscal configurável…"
                disabled={isLoading || updateMutation.isPending}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="georgia-invoice-payment-terms">Condições de pagamento</Label>
              <Input
                id="georgia-invoice-payment-terms"
                value={issuer.invoice_payment_terms}
                onChange={e => setIssuer(prev => ({ ...prev, invoice_payment_terms: e.target.value }))}
                placeholder="Pagamento até 30 dias após a data de emissão."
                disabled={isLoading || updateMutation.isPending}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="georgia-invoice-footer-note">Nota de rodapé</Label>
              <Textarea
                id="georgia-invoice-footer-note"
                rows={2}
                value={issuer.invoice_footer_note}
                onChange={e => setIssuer(prev => ({ ...prev, invoice_footer_note: e.target.value }))}
                placeholder="Nota final do documento…"
                disabled={isLoading || updateMutation.isPending}
              />
            </div>
          </div>
          <Button type="submit" disabled={isLoading || updateMutation.isPending}>
            {updateMutation.isPending ? "A guardar…" : "Guardar dados da empresa"}
          </Button>
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
