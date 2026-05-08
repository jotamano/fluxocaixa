import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus, Trash2, Users, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

interface Member {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
}

function useMembers() {
  return useQuery({
    queryKey: ["members"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("list_members");
      if (error) throw error;
      return (data ?? []) as Member[];
    },
  });
}

function generateTempPassword(): string {
  // 12-char password mixing letters, digits and symbols. Generated client-side
  // and shown once to the operator — never persisted in the UI state.
  const chars = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789@#$%";
  const arr = new Uint32Array(12);
  crypto.getRandomValues(arr);
  return Array.from(arr, n => chars[n % chars.length]).join("");
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Members() {
  const { toast } = useToast();
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: members = [], isLoading, error } = useMembers();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Member | null>(null);
  const [credentialsToShow, setCredentialsToShow] =
    useState<{ email: string; password: string } | null>(null);

  const inviteMutation = useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      const { error } = await supabase.rpc("invite_member", {
        p_email: email,
        p_password: password,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["members"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("delete_member", { p_user_id: id });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["members"] }),
  });

  const handleInvite = async (email: string, password: string) => {
    try {
      await inviteMutation.mutateAsync({ email, password });
      setInviteOpen(false);
      setCredentialsToShow({ email, password });
      toast({ title: "Membro criado", description: email });
    } catch (e) {
      toast({
        title: "Erro a criar membro",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    }
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await deleteMutation.mutateAsync(pendingDelete.id);
      toast({ title: "Membro removido", description: pendingDelete.email });
    } catch (e) {
      toast({
        title: "Erro a remover",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setPendingDelete(null);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold font-display text-foreground">Membros</h1>
          <p className="mt-1 text-muted-foreground">
            Pessoas com acesso ao programa. Cada membro pode passar faturas, receber pagamentos
            e gerir clientes — todas as ações ficam registadas em /auditoria.
          </p>
        </div>
        <Button onClick={() => setInviteOpen(true)} className="gap-2">
          <UserPlus className="h-4 w-4" /> Convidar membro
        </Button>
      </div>

      {error && (
        <Card>
          <CardContent className="py-6 text-sm text-destructive">
            Erro a carregar membros: {error instanceof Error ? error.message : String(error)}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-medium">
            <Users className="h-4 w-4" />
            {isLoading ? "A carregar…" : `${members.length} membro(s)`}
          </CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          {!isLoading && members.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Ainda não há membros. Convida um para começar.
            </p>
          )}
          {members.map(m => {
            const isSelf = user?.id === m.id;
            return (
              <div
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {m.email}
                    {isSelf && (
                      <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        tu
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    criado a {formatDateTime(m.created_at)} · última sessão{" "}
                    {formatDateTime(m.last_sign_in_at)}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  disabled={isSelf}
                  onClick={() => setPendingDelete(m)}
                  title={isSelf ? "Não te podes eliminar a ti próprio" : "Remover membro"}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Remover
                </Button>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <InviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onInvite={handleInvite}
        submitting={inviteMutation.isPending}
      />

      <CredentialsDialog
        credentials={credentialsToShow}
        onClose={() => setCredentialsToShow(null)}
      />

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={open => !open && setPendingDelete(null)}
        title="Remover membro?"
        description={
          pendingDelete
            ? `${pendingDelete.email} deixará de ter acesso. Esta ação fica registada em /auditoria. As faturas e pagamentos criados por este membro permanecem.`
            : ""
        }
        onConfirm={handleConfirmDelete}
        confirmLabel="Remover"
      />
    </div>
  );
}

interface InviteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInvite: (email: string, password: string) => void;
  submitting: boolean;
}

function InviteDialog({ open, onOpenChange, onInvite, submitting }: InviteDialogProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(generateTempPassword);

  const reset = () => {
    setEmail("");
    setPassword(generateTempPassword());
  };

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Convidar membro</DialogTitle>
          <DialogDescription>
            Cria a conta com uma palavra-passe temporária. O membro pode iniciar sessão imediatamente
            e mudá-la depois. Vais ver a palavra-passe uma única vez — copia-a e envia ao colega.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={e => {
            e.preventDefault();
            if (!email || !password) return;
            onInvite(email.trim(), password);
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="member-email">Email</Label>
            <Input
              id="member-email"
              type="email"
              autoComplete="off"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="member-password">Palavra-passe inicial</Label>
            <div className="flex gap-2">
              <Input
                id="member-password"
                type="text"
                autoComplete="off"
                value={password}
                onChange={e => setPassword(e.target.value)}
                minLength={6}
                required
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => setPassword(generateTempPassword())}
              >
                Gerar
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Mínimo 6 caracteres. O membro pode mudar depois de iniciar sessão.
            </p>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting || !email || password.length < 6}>
              {submitting ? "A criar…" : "Criar conta"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface CredentialsDialogProps {
  credentials: { email: string; password: string } | null;
  onClose: () => void;
}

function CredentialsDialog({ credentials, onClose }: CredentialsDialogProps) {
  const [copied, setCopied] = useState(false);
  if (!credentials) return null;
  const block = `Email: ${credentials.email}\nPalavra-passe: ${credentials.password}`;
  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Conta criada</DialogTitle>
          <DialogDescription>
            Esta é a única vez que vais ver a palavra-passe. Envia-a ao membro por um canal seguro.
          </DialogDescription>
        </DialogHeader>
        <pre className="rounded-lg border bg-muted/40 px-3 py-2 text-sm font-mono whitespace-pre-wrap break-all">
{block}
        </pre>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={async () => {
              await navigator.clipboard.writeText(block);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copiado" : "Copiar"}
          </Button>
          <Button type="button" onClick={onClose}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
