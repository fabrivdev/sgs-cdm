import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { CalendarDays, LayoutDashboard, ListChecks, History, Users, LogOut, Wrench, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useUnseen } from "@/hooks/useUnseen";
import { cn } from "@/lib/utils";

const items = [
  { to: "/", label: "Planificador", icon: ListChecks, end: true },
  { to: "/calendario", label: "Calendario", icon: CalendarDays },
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/historial", label: "Historial", icon: History },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile, isAdmin, signOut, roles } = useAuth();
  const unseen = useUnseen();
  const location = useLocation();

  const navItems = [...items, ...(isAdmin ? [{ to: "/admin", label: "Admin", icon: Users, end: false }] : [])];

  return (
    <div className="min-h-screen bg-background">
      {/* Top header */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b bg-card px-4 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Wrench className="h-4 w-4" />
          </div>
          <div className="hidden sm:block">
            <div className="text-sm font-bold leading-tight">Servicios Técnicos</div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">CLAAS · HORSCH</div>
          </div>
        </div>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          {navItems.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              end={it.end as boolean | undefined}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive ? "bg-primary text-primary-foreground" : "hover:bg-accent",
                )
              }
            >
              <it.icon className="h-4 w-4" />
              {it.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-4 w-4" />
              {unseen > 0 && (
                <Badge className="absolute -right-1 -top-1 h-5 min-w-5 rounded-full px-1 text-[10px] tabular-nums">
                  {unseen}
                </Badge>
              )}
            </Button>
          </div>
          <div className="hidden sm:flex flex-col items-end text-right">
            <span className="text-xs font-medium leading-tight">{profile?.nombre ?? "—"}</span>
            <span className="text-[10px] text-muted-foreground leading-tight">
              {roles.join(" · ") || "sin rol"} {profile?.sucursal ? `· ${profile.sucursal}` : ""}
            </span>
          </div>
          <Button variant="ghost" size="icon" onClick={signOut} title="Salir">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <main className="pb-20 md:pb-6">{children}</main>

      {/* Bottom nav (mobile) */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 grid grid-cols-5 border-t bg-card md:hidden">
        {navItems.slice(0, 5).map((it) => {
          const active =
            it.end ? location.pathname === it.to : location.pathname.startsWith(it.to);
          return (
            <NavLink
              key={it.to}
              to={it.to}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 py-2 text-[10px]",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <it.icon className="h-5 w-5" />
              {it.label}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
