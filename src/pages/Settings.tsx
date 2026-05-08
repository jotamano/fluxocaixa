import { useEffect, useState } from "react";
import { Settings as SettingsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
