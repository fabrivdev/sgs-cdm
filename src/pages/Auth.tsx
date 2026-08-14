import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { APP_NAME, APP_SHORT_NAME, AppLogo } from "@/components/AppBrand";
import GradientWaves from "@/components/auth/GradientWaves";
import { ArrowRight, Eye, EyeOff, LockKeyhole, ShieldCheck, UserRound } from "lucide-react";

export default function Auth() {
  const { user, signIn, loading, defaultRoute } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  if (!loading && user) return <Navigate to={defaultRoute} replace />;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await signIn(email, password);
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success("Bienvenido");
  };

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#f8faf5] px-4 py-6 sm:px-6 sm:py-8">
      <div className="absolute inset-0" aria-hidden="true">
        <GradientWaves />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(255,255,255,0.5),transparent_46%,rgba(255,255,255,0.12)_100%)]" />
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.4),transparent_38%,rgba(255,255,255,0.2))] motion-reduce:bg-[#f8faf5]"
      />

      <Card className="relative z-10 mt-6 w-full max-w-[420px] border-white/80 bg-white/[0.88] shadow-[0_24px_70px_rgba(31,46,20,0.22)] backdrop-blur-xl sm:mt-8">
        <CardContent className="px-5 py-6 sm:px-7 sm:py-7">
          <div className="text-center">
            <AppLogo className="mx-auto h-12 w-12 sm:h-14 sm:w-14" />
            <h1 className="mt-3 text-2xl font-bold tracking-[-0.03em] text-slate-900 sm:text-[28px]">
              {APP_SHORT_NAME}
            </h1>
            <p className="mt-2 text-[12px] text-slate-500 sm:text-[13px]">{APP_NAME}</p>
          </div>

          <form onSubmit={onSubmit} className="mt-6 space-y-4 sm:mt-7 sm:space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-[12px] font-semibold text-slate-900">Email</Label>
              <div className="relative">
                <UserRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  placeholder="Ingresa tu email"
                  className="h-11 rounded-lg border-slate-300 bg-white/80 pl-10 pr-4 text-[13px] text-slate-900 shadow-sm placeholder:text-slate-400 focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary sm:h-12"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-[12px] font-semibold text-slate-900">Contraseña</Label>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="Ingresa tu contraseña"
                  className="h-11 rounded-lg border-slate-300 bg-white/80 pl-10 pr-12 text-[13px] text-slate-900 shadow-sm placeholder:text-slate-400 focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary sm:h-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="h-11 w-full rounded-lg bg-[#86a536] text-[13px] font-semibold shadow-[0_10px_24px_rgba(111,139,44,0.25)] transition-all hover:-translate-y-0.5 hover:bg-[#78952f] hover:shadow-[0_14px_28px_rgba(111,139,44,0.3)] sm:h-12"
              disabled={busy}
            >
              {busy ? "Ingresando…" : "Ingresar"}
              {!busy && <ArrowRight className="h-4 w-4" />}
            </Button>

            <p className="flex items-center justify-center gap-2 text-center text-[11px] text-slate-500 sm:text-[12px]">
              <ShieldCheck className="h-3.5 w-3.5 text-[#6f922b]" />
              Tu información está protegida
            </p>
          </form>
        </CardContent>
      </Card>

      <footer className="relative z-10 mt-auto pt-8 text-center text-[11px] text-slate-500 sm:text-[12px]">
        © {new Date().getFullYear()} SIG. Todos los derechos reservados.
      </footer>
    </main>
  );
}
