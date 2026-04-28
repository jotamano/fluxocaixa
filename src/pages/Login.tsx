import { useState, type FormEvent } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";

type Mode = "signin" | "signup";

export default function Login() {
  const { signIn, signUp, session, loading } = useAuth();
  const location = useLocation();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (loading) return null;
  if (session) {
    const redirectTo = (location.state as { from?: string } | null)?.from ?? "/";
    return <Navigate to={redirectTo} replace />;
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setSubmitting(true);
    if (mode === "signin") {
      const result = await signIn(email, password);
      if (result.error) setError(result.error);
    } else {
      const result = await signUp(email, password);
      if (result.error) {
        setError(result.error);
      } else if (result.needsConfirmation) {
        setInfo("Conta criada. Verifica o teu email para confirmar antes de iniciar sessão.");
        setMode("signin");
        setPassword("");
      }
      // If session was created immediately (autoconfirm on), the AuthProvider
      // listener picks it up and the redirect above runs on next render.
    }
    setSubmitting(false);
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    setError(null);
    setInfo(null);
  };

  const isSignup = mode === "signup";

  return (
    <div className="min-h-screen grid place-items-center bg-background p-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-6 rounded-xl border border-border bg-card p-8 shadow-card"
      >
        <div className="space-y-1">
          <h1 className="text-2xl font-display font-bold">Marketing Billing</h1>
          <p className="text-sm text-muted-foreground">
            {isSignup ? "Cria uma conta para continuar." : "Inicia sessão para continuar."}
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Palavra-passe</Label>
          <Input
            id="password"
            type="password"
            autoComplete={isSignup ? "new-password" : "current-password"}
            required
            minLength={isSignup ? 6 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {isSignup && (
            <p className="text-xs text-muted-foreground">Mínimo 6 caracteres.</p>
          )}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {info && <p className="text-sm text-muted-foreground">{info}</p>}
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting
            ? isSignup
              ? "A registar..."
              : "A entrar..."
            : isSignup
              ? "Criar conta"
              : "Entrar"}
        </Button>
        <div className="text-center text-sm text-muted-foreground">
          {isSignup ? (
            <>
              Já tens conta?{" "}
              <button
                type="button"
                className="text-primary underline-offset-4 hover:underline"
                onClick={() => switchMode("signin")}
              >
                Inicia sessão
              </button>
            </>
          ) : (
            <>
              Não tens conta?{" "}
              <button
                type="button"
                className="text-primary underline-offset-4 hover:underline"
                onClick={() => switchMode("signup")}
              >
                Regista-te
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}
