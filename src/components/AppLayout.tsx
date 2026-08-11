import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  CalendarDays,
  ChevronDown,
  LayoutDashboard,
  ListChecks,
  Users,
  LogOut,
  Wrench,
  Tractor,
  MoreHorizontal,
  Package,
  ShoppingCart,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { useUnseen } from "@/hooks/useUnseen";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import { NotificationsPanel } from "@/components/NotificationsPanel";
import { cn } from "@/lib/utils";
import { AIAssistant } from "@/components/assistant/AIAssistant";
import { nivelLabel } from "@/lib/constants";
import { APP_NAME, APP_SHORT_NAME, AppLogo } from "@/components/AppBrand";

type NavItem = { to: string; label: string; icon: typeof ListChecks; end?: boolean; adminOnly?: boolean };
type NavGroup = { modulo: string; label: string; items: NavItem[] };

// Temporary kill switch: preserves the assistant configuration and history for a future re-enable.
const AI_ASSISTANT_ENABLED = false;

const navGroups: NavGroup[] = [
  {
    modulo: "servicios",
    label: "Servicios",
    items: [
      { to: "/", label: "Planificador", icon: ListChecks, end: true },
      { to: "/trabajos", label: "Trabajos", icon: Wrench },
      { to: "/calendario", label: "Calendario", icon: CalendarDays },
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, adminOnly: true },
    ],
  },
  {
    modulo: "parque",
    label: "Parque",
    items: [
      { to: "/parque-clientes", label: "Clientes y máquinas", icon: Tractor, end: true },
    ],
  },
  {
    modulo: "repuestos",
    label: "Repuestos",
    items: [
      { to: "/repuestos", label: "Catálogo y Stock", icon: Package, end: true },
      { to: "/repuestos/compras", label: "Compras", icon: ShoppingCart, end: true },
    ],
  },
];

/**
 * Un grupo de modulo en el sidebar. Se comporta como acordeon (un solo
 * grupo abierto a la vez, controlado por el padre) cuando el sidebar esta
 * expandido; en modo rail de iconos el acordeon se ignora (siempre muestra
 * los iconos, ya que el label/trigger queda invisible por el primitivo).
 */
function ModuloNavGroup({
  group,
  open,
  onOpenChange,
  isItemActive,
}: {
  group: NavGroup;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isItemActive: (it: NavItem) => boolean;
}) {
  const { state } = useSidebar();
  const iconRail = state === "collapsed";
  const effectiveOpen = iconRail || open;

  return (
    <Collapsible open={effectiveOpen} onOpenChange={iconRail ? undefined : onOpenChange}>
      {/* p-0: el padding vertical por defecto de SidebarGroup se reserva aunque el
          contenido este colapsado, dejando un hueco entre grupos cerrados. Lo movemos
          al label y al content para que un grupo cerrado ocupe solo su fila. */}
      <SidebarGroup className="p-0">
        <CollapsibleTrigger asChild>
          <SidebarGroupLabel className="mx-2 flex cursor-pointer items-center justify-between rounded-md pr-1.5 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
            <span>{group.label}</span>
            <ChevronDown
              className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
            />
          </SidebarGroupLabel>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarGroupContent className="px-2 pb-2 pt-1">
            <SidebarMenu>
              {group.items.map((it) => (
                <SidebarMenuItem key={it.to}>
                  <SidebarMenuButton
                    asChild
                    isActive={isItemActive(it)}
                    tooltip={it.label}
                    className="transition-[width,height,padding,background-color,color] duration-300 data-[active=true]:bg-primary data-[active=true]:text-primary-foreground data-[active=true]:hover:bg-primary data-[active=true]:hover:text-primary-foreground"
                  >
                    <NavLink to={it.to} end={it.end as boolean | undefined} className="group/nav">
                      <it.icon className="transition-transform duration-300 group-hover/nav:scale-110" />
                      <span className="group-data-[collapsible=icon]:hidden">{it.label}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}

export function AppLayout({ children }: { children?: React.ReactNode }) {
  const { profile, isAdmin, hasModuloAccess, signOut, roles, moduloAccess } = useAuth();
  const unseen = useUnseen();
  const online = useOnlineStatus();
  const location = useLocation();
  const navigate = useNavigate();

  // Un grupo solo aparece si el usuario tiene acceso a ese modulo; adminOnly
  // sigue siendo un filtro adicional para vistas ejecutivas o administrativas.
  const visibleGroups = navGroups
    .filter((group) => hasModuloAccess(group.modulo))
    .map((group) => ({
      ...group,
      items: group.items.filter((it) => !(it.adminOnly && !isAdmin)),
    }))
    .filter((group) => group.items.length > 0);

  const isItemActive = (it: { to: string; end?: boolean }) =>
    it.end ? location.pathname === it.to : location.pathname.startsWith(it.to);

  // Acordeon: un solo grupo de modulo abierto a la vez. Se sincroniza con la
  // ruta activa para que al navegar se abra el grupo correspondiente.
  const [openModulo, setOpenModulo] = useState<string | null>(visibleGroups[0]?.modulo ?? null);
  useEffect(() => {
    const activeGroup = visibleGroups.find((group) => group.items.some(isItemActive));
    if (activeGroup) setOpenModulo(activeGroup.modulo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const allVisibleItems = visibleGroups.flatMap((group) => group.items);
  const mobilePrimaryItems = isAdmin
    ? allVisibleItems.filter((it) => ["/", "/trabajos", "/dashboard"].includes(it.to))
    : allVisibleItems.slice(0, 3);
  const mobileOverflowItems = allVisibleItems.filter((it) => !mobilePrimaryItems.some((primary) => primary.to === it.to));
  const overflowActive = mobileOverflowItems.some(isItemActive);

  const initials = (profile?.nombre ?? "?")
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const nivelActual = nivelLabel(roles[0], moduloAccess);

  return (
    <SidebarProvider>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:shadow-md focus:ring-2 focus:ring-primary"
      >
        Ir al contenido principal
      </a>

      {/* Sidebar desktop: colapsable a rail de iconos, agrupado por modulo. No se muestra en mobile (el bottom-nav sigue siendo la navegacion mobile). */}
      <Sidebar collapsible="icon" className="hidden md:flex">
        <SidebarHeader>
          <div className="flex items-center gap-2 px-2 py-1.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:px-0">
            <AppLogo className="h-8 w-8 rounded-md" />
            <div className="min-w-0 group-data-[collapsible=icon]:hidden">
              <div className="truncate text-sm font-bold leading-tight">{APP_SHORT_NAME}</div>
              <div className="truncate text-[10px] text-muted-foreground">{APP_NAME}</div>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent>
          {visibleGroups.map((group) => (
            <ModuloNavGroup
              key={group.modulo}
              group={group}
              open={openModulo === group.modulo}
              onOpenChange={(isOpen) => setOpenModulo(isOpen ? group.modulo : null)}
              isItemActive={isItemActive}
            />
          ))}
        </SidebarContent>
      </Sidebar>

      <SidebarInset className="min-h-screen bg-background">
        {/* Top header */}
        <header className="sticky top-0 z-40 flex h-[52px] items-center justify-between border-b bg-card/95 px-3 shadow-sm backdrop-blur sm:h-14 sm:px-4">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="hidden md:flex" />
            <AppLogo className="h-8 w-8 rounded-md md:hidden" />
            <div className="hidden sm:block md:hidden">
              <div className="text-sm font-bold leading-tight">{APP_SHORT_NAME}</div>
              <div className="text-[10px] text-muted-foreground">{APP_NAME}</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <NotificationsPanel count={unseen} />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-9 gap-2 px-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                    {initials}
                  </div>
                  <div className="hidden sm:flex flex-col items-start text-left leading-tight">
                    <span className="text-xs font-medium">{profile?.nombre ?? "—"}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {nivelActual}
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
                      {nivelActual}
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

        {!online && (
          <div className="sticky top-[52px] z-30 border-b border-amber-200 bg-amber-50 px-3 py-2 text-center text-xs font-medium text-amber-900 sm:top-14">
            Sin conexion. Los datos pueden no estar actualizados.
          </div>
        )}

        <main id="main-content" className="pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-6">{children ?? <Outlet />}</main>

        {AI_ASSISTANT_ENABLED && <AIAssistant />}

        {/* Bottom nav (mobile) */}
        <nav className="fixed bottom-0 left-0 right-0 z-40 border-t bg-card/95 shadow-[0_-4px_16px_rgba(15,23,42,0.06)] backdrop-blur md:hidden">
          <div className="grid grid-cols-4 px-1 pb-[env(safe-area-inset-bottom)]">
            {mobilePrimaryItems.map((it) => {
              const active = isItemActive(it);
              return (
                <NavLink
                  key={it.to}
                  to={it.to}
                  className={cn(
                    "flex min-w-0 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  <it.icon className="h-5 w-5" />
                  <span className="max-w-full truncate">{it.label}</span>
                </NavLink>
              );
            })}
            {mobileOverflowItems.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "flex min-w-0 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium",
                      overflowActive ? "text-primary" : "text-muted-foreground",
                    )}
                    aria-label="Más páginas"
                  >
                    <MoreHorizontal className="h-5 w-5" />
                    <span className="max-w-full truncate">Más</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" side="top" className="mb-2 w-48">
                  {mobileOverflowItems.map((it) => {
                    const active = isItemActive(it);
                    return (
                      <DropdownMenuItem
                        key={it.to}
                        onClick={() => navigate(it.to)}
                        className={cn("gap-2", active && "bg-accent font-medium text-primary")}
                      >
                        <it.icon className="h-4 w-4" />
                        {it.label}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </nav>
      </SidebarInset>
    </SidebarProvider>
  );
}
