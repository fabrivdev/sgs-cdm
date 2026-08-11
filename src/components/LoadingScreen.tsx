import { AppLogo } from "@/components/AppBrand";

export function LoadingScreen() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-background/80 backdrop-blur-md">
      {/* Diffuse floating particles */}
      <div className="pointer-events-none absolute inset-0">
        {[...Array(12)].map((_, i) => (
          <span
            key={i}
            className="absolute rounded-full bg-primary/20 blur-xl"
            style={{
              width: `${Math.random() * 80 + 40}px`,
              height: `${Math.random() * 80 + 40}px`,
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animation: `float ${Math.random() * 8 + 8}s ease-in-out infinite`,
              animationDelay: `${Math.random() * 5}s`,
              opacity: 0.3 + Math.random() * 0.3,
            }}
          />
        ))}
      </div>

      {/* Central spinning logo */}
      <div className="relative z-10 flex flex-col items-center gap-4">
        <div className="relative">
          <div className="absolute inset-0 animate-pulse rounded-full bg-primary/15 blur-2xl" />
          <div className="animate-spin-slow rounded-full p-6">
            <AppLogo className="h-20 w-20 object-contain sm:h-28 sm:w-28" />
          </div>
        </div>
        <p className="text-sm font-medium text-muted-foreground animate-pulse">
          Cargando…
        </p>
      </div>

      <style>{`
        @keyframes float {
          0%, 100% { transform: translate(0, 0); }
          25% { transform: translate(20px, -30px); }
          50% { transform: translate(-15px, 15px); }
          75% { transform: translate(25px, 20px); }
        }
      `}</style>
    </div>
  );
}
