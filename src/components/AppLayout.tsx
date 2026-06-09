import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  CalendarDays,
  LayoutDashboard,
  ListChecks,
  History,
  Users,
  LogOut,
  Wrench,
  Bell,
  Tractor,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUnseen } from "@/hooks/useUnseen";
import { cn } from "@/lib/utils";

const baseItems = [
  { to: "/", label: "Planificador", icon: ListChecks, end: true },
  { to: "/trabajos", label: "Trabajos", icon: Wrench },
  { to: "/calendario", label: "Calendario", icon: CalendarDays },
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, adminOnly: true },
  { to: "/historial", label: "Historial", icon: History },
];

export function AppLayout({ children }: { children?: React.ReactNode }) {
  const { profile, isAdmin, isCabecilla, signOut, roles } = useAuth();
  const unseen = useUnseen();
  const location = useLocation();
  const navigate = useNavigate();

  const navItems = [
    ...baseItems.filter((it) => !(it.adminOnly && !isAdmin)),
    ...(isAdmin
      ? [{ to: "/parque-clientes", label: "Parque", icon: Tractor, end: false }]
      : []),
  ];

  const initials = (profile?.nombre ?? "?")
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="min-h-screen bg-background">
      {/* Top header */}
      <header className="sticky top-0 z-40 flex h-[52px] items-center justify-between border-b bg-card/95 px-3 shadow-sm backdrop-blur sm:h-14 sm:px-4">
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
          <Button variant="ghost" size="icon" className="relative">
            <Bell className="h-4 w-4" />
            {unseen > 0 && (
              <Badge className="absolute -right-1 -top-1 h-5 min-w-5 rounded-full px-1 text-[10px] tabular-nums">
                {unseen}
              </Badge>
            )}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-9 gap-2 px-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                  {initials}
                </div>
                <div className="hidden sm:flex flex-col items-start text-left leading-tight">
                  <span className="text-xs font-medium">{profile?.nombre ?? "—"}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {roles.join(" · ") || "sin rol"}
                    {profile?.sucursal ? ` · ${profile.sucursal}` : ""}
                  </span>
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{profile?.nombre ?? "—"}</span>
                  <span className="text-[11px] font-normal text-muted-foreground">
                    {roles.join(" · ") || "sin rol"}
                    {profile?.sucursal ? ` · ${profile.sucursal}` : ""}
                  </span>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {isAdmin && (
                <DropdownMenuItem onClick={() => navigate("/admin")}>
                  <Users className="mr-2 h-4 w-4" />
                  Administración
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={signOut}>
                <LogOut className="mr-2 h-4 w-4" />
                Cerrar sesión
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <main className="pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-6">{children ?? <Outlet />}</main>

      {/* Bottom nav (mobile) */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t bg-card/95 shadow-[0_-4px_16px_rgba(15,23,42,0.06)] backdrop-blur md:hidden">
        <div className="flex overflow-x-auto px-1 pb-[env(safe-area-inset-bottom)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {navItems.map((it) => {
            const active =
              it.end ? location.pathname === it.to : location.pathname.startsWith(it.to);
            return (
              <NavLink
                key={it.to}
                to={it.to}
                className={cn(
                  "flex min-w-[72px] flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <it.icon className="h-5 w-5" />
                <span className="max-w-full truncate">{it.label}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
