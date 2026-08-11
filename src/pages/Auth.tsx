import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { APP_NAME, APP_SHORT_NAME, AppLogo } from "@/components/AppBrand";
import { ArrowRight, Eye, EyeOff, LockKeyhole, ShieldCheck, UserRound } from "lucide-react";

export default function Auth() {
  const { user, signIn, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  if (!loading && user) return <Navigate to="/" replace />;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await signIn(email, password);
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success("Bienvenido");
  };

  return (
    <main
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#fbfbf7] bg-cover bg-bottom bg-no-repeat px-4 py-6 sm:px-6 sm:py-8"
      style={{ backgroundImage: "url('/sig-login-background.png')" }}
    >
      <img
        src="/sig-cdm-logo.png"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute -right-20 -top-24 hidden h-[430px] w-[430px] select-none opacity-[0.045] md:block"
      />

      <Card className="relative z-10 mt-6 w-full max-w-[532px] border-white/80 bg-white/90 shadow-[0_20px_55px_rgba(40,52,31,0.14)] backdrop-blur-sm sm:mt-8">
        <CardContent className="px-5 py-7 sm:px-8 sm:py-9">
          <div className="text-center">
            <AppLogo className="mx-auto h-16 w-16 sm:h-20 sm:w-20" />
            <h1 className="mt-3 text-3xl font-bold tracking-[-0.03em] text-slate-900 sm:text-4xl">
              {APP_SHORT_NAME}
            </h1>
            <p className="mt-2 text-sm text-slate-500 sm:text-lg">{APP_NAME}</p>
          </div>

          <form onSubmit={onSubmit} className="mt-7 space-y-5 sm:mt-9 sm:space-y-6">
            <div className="space-y-2.5">
              <Label htmlFor="email" className="text-sm font-semibold text-slate-900 sm:text-base">Email</Label>
              <div className="relative">
                <UserRound className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  placeholder="Ingresa tu email"
                  className="h-14 rounded-xl border-slate-300 bg-white/80 pl-12 pr-4 text-base text-slate-900 shadow-sm placeholder:text-slate-400 focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary sm:h-[58px]"
                />
              </div>
            </div>

            <div className="space-y-2.5">
              <Label htmlFor="password" className="text-sm font-semibold text-slate-900 sm:text-base">Contraseña</Label>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="Ingresa tu contraseña"
                  className="h-14 rounded-xl border-slate-300 bg-white/80 pl-12 pr-12 text-base text-slate-900 shadow-sm placeholder:text-slate-400 focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary sm:h-[58px]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((visible) => !visible)}
                  className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="h-14 w-full rounded-xl bg-[#86a536] text-base font-semibold shadow-[0_10px_24px_rgba(111,139,44,0.25)] transition-all hover:-translate-y-0.5 hover:bg-[#78952f] hover:shadow-[0_14px_28px_rgba(111,139,44,0.3)] sm:h-[60px] sm:text-lg"
              disabled={busy}
            >
              {busy ? "Ingresando…" : "Ingresar"}
              {!busy && <ArrowRight className="h-5 w-5" />}
            </Button>

            <p className="flex items-center justify-center gap-2 text-center text-xs text-slate-500 sm:text-sm">
              <ShieldCheck className="h-4 w-4 text-[#6f922b]" />
              Tu información está protegida
            </p>
          </form>
        </CardContent>
      </Card>

      <footer className="relative z-10 mt-auto pt-8 text-center text-xs text-slate-500 sm:text-sm">
        © {new Date().getFullYear()} SIG. Todos los derechos reservados.
      </footer>
    </main>
  );
}
