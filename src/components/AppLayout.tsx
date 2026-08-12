import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  BriefcaseBusiness,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  LayoutDashboard,
  ListChecks,
  Users,
  LogOut,
  Wrench,
  Tractor,
  Menu,
  Package,
  ShoppingCart,
  Sparkles,
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarFooter,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { useUnseen } from "@/hooks/useUnseen";
import { NotificationsPanel } from "@/components/NotificationsPanel";
import { cn } from "@/lib/utils";
import { AIAssistant } from "@/components/assistant/AIAssistant";
import { nivelLabel } from "@/lib/constants";
import { APP_NAME, APP_SHORT_NAME, AppLogo } from "@/components/AppBrand";

type NavItem = { to: string; label: string; icon: typeof ListChecks; end?: boolean; managementOnly?: boolean };
type NavGroup = { modulo: string; label: string; icon: typeof BriefcaseBusiness; items: NavItem[] };

// Temporary kill switch: preserves the assistant configuration and history for a future re-enable.
const AI_ASSISTANT_ENABLED = false;

const navGroups: NavGroup[] = [
  {
    modulo: "servicios",
    label: "Servicios",
    icon: BriefcaseBusiness,
    items: [
      { to: "/", label: "Planificador", icon: ListChecks, end: true },
      { to: "/trabajos", label: "Trabajos", icon: Wrench },
      { to: "/calendario", label: "Calendario", icon: CalendarDays },
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, managementOnly: true },
    ],
  },
  {
    modulo: "parque",
    label: "Parque",
    icon: Tractor,
    items: [
      { to: "/parque-clientes", label: "Clientes", icon: Users, end: true },
      { to: "/parque-maquinas", label: "Máquinas", icon: Tractor, end: true },
      { to: "/parque-stock", label: "Stock", icon: Package, end: true },
    ],
  },
  {
    modulo: "repuestos",
    label: "Repuestos",
    icon: Package,
    items: [
      { to: "/repuestos", label: "Catálogo y Stock", icon: Package, end: true },
      { to: "/repuestos/compras", label: "Compras", icon: ShoppingCart, end: true },
      { to: "/repuestos/sugerencias", label: "Sugerencia de compra", icon: Sparkles, end: true },
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
  const { state, toggleSidebar } = useSidebar();
  const iconRail = state === "collapsed";
  const effectiveOpen = !iconRail && open;
  const groupActive = group.items.some(isItemActive);
  const GroupIcon = group.icon;

  return (
    <Collapsible open={effectiveOpen} onOpenChange={onOpenChange}>
      <SidebarGroup className="p-0">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            onClick={() => iconRail && toggleSidebar()}
            className={cn(
              "group/module mx-2 flex h-14 w-[calc(100%-1rem)] items-center gap-3 rounded-2xl px-3 text-left outline-none transition-[background-color,color,box-shadow,transform] duration-200 ease-spring hover:bg-sidebar-accent/80 active:scale-[0.985] focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2",
              groupActive && "bg-sidebar-accent/70 text-sidebar-accent-foreground shadow-[inset_0_0_0_1px_hsl(var(--sidebar-border)/0.55)]",
              "group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:h-11 group-data-[collapsible=icon]:w-11 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:rounded-xl group-data-[collapsible=icon]:px-0",
            )}
            aria-label={group.label}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/[0.08] text-primary transition-[transform,background-color] duration-200 group-hover/module:scale-105 group-hover/module:bg-primary/[0.12]">
              <GroupIcon className="h-[18px] w-[18px]" />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold group-data-[collapsible=icon]:hidden">{group.label}</span>
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300 ease-spring group-data-[collapsible=icon]:hidden",
                open && "rotate-180",
              )}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
          <SidebarGroupContent className="relative mx-5 mb-2 ml-[3.25rem] border-l border-primary/25 pb-2 pl-3 pt-1 group-data-[collapsible=icon]:hidden">
            <SidebarMenu className="gap-0.5">
              {group.items.map((it) => (
                <SidebarMenuItem key={it.to}>
                  <SidebarMenuButton
                    asChild
                    isActive={isItemActive(it)}
                    tooltip={it.label}
                    className="h-9 rounded-xl px-2.5 text-[13px] transition-[background-color,color,transform] duration-200 ease-spring hover:translate-x-0.5 data-[active=true]:bg-primary/[0.10] data-[active=true]:font-semibold data-[active=true]:text-primary data-[active=true]:hover:bg-primary/[0.14]"
                  >
                    <NavLink to={it.to} end={it.end as boolean | undefined} className="group/nav">
                      <it.icon className="transition-transform duration-200 group-hover/nav:scale-110" />
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
  const { profile, isAdmin, hasModuloAccess, can, signOut, roles, moduloAccess } = useAuth();
  const unseen = useUnseen();
  const location = useLocation();
  const navigate = useNavigate();

  // Un grupo solo aparece si el usuario tiene acceso a ese modulo; las vistas
  // ejecutivas exigen ademas la capacidad correspondiente.
  const visibleGroups = navGroups
    .filter((group) => hasModuloAccess(group.modulo))
    .map((group) => ({
      ...group,
      items: group.items.filter((it) => !(it.managementOnly && !can("dashboard:ver"))),
    }))
    .filter((group) => group.items.length > 0);

  const isItemActive = (it: { to: string; end?: boolean }) =>
    it.end ? location.pathname === it.to : location.pathname.startsWith(it.to);

  // Acordeon: un solo grupo de modulo abierto a la vez. Se sincroniza con la
  // ruta activa para que al navegar se abra el grupo correspondiente.
  const [openModulo, setOpenModulo] = useState<string | null>(visibleGroups[0]?.modulo ?? null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  useEffect(() => {
    const activeGroup = visibleGroups.find((group) => group.items.some(isItemActive));
    if (activeGroup) setOpenModulo(activeGroup.modulo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

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

      {/* Sidebar desktop: colapsable a rail de iconos, agrupado por módulo. */}
      <Sidebar collapsible="icon" className="z-50 hidden md:flex">
        <SidebarHeader className="h-14 justify-center border-b border-sidebar-border/70 p-2 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-2">
          <div className="flex h-full w-full items-center gap-2.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0">
            <AppLogo className="h-8 w-8 rounded-lg transition-transform duration-300 ease-spring group-hover/sidebar-wrapper:scale-[1.02]" />
            <div className="min-w-0 group-data-[collapsible=icon]:hidden">
              <div className="truncate text-sm font-bold leading-tight">{APP_SHORT_NAME}</div>
              <div className="truncate text-[10px] tracking-[-0.01em] text-muted-foreground">{APP_NAME}</div>
            </div>
            <SidebarTrigger className="ml-auto h-8 w-8 rounded-lg border border-sidebar-border bg-sidebar shadow-sm transition-[transform,background-color,box-shadow] duration-200 hover:bg-sidebar-accent hover:shadow-md active:scale-95 group-data-[collapsible=icon]:absolute group-data-[collapsible=icon]:left-[calc(100%+0.375rem)] group-data-[collapsible=icon]:right-auto group-data-[collapsible=icon]:top-3">
              <ChevronLeft className="transition-transform duration-300 ease-spring group-data-[collapsible=icon]:rotate-180" />
            </SidebarTrigger>
          </div>
        </SidebarHeader>
        <SidebarContent className="gap-1 px-1 py-4">
          <div className="px-4 pb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground group-data-[collapsible=icon]:hidden">
            Módulos
          </div>
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
        <SidebarFooter className="border-t border-sidebar-border/70 px-5 py-4 group-data-[collapsible=icon]:hidden" />
      </Sidebar>

      <SidebarInset className="min-h-screen bg-background">
        {/* Top header */}
        <header className="sticky top-0 z-40 flex h-[52px] items-center justify-between border-b border-border/70 bg-card/95 px-3 backdrop-blur sm:h-14 sm:px-4">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 gap-1.5 px-2 md:hidden"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Abrir menú de módulos"
            >
              <Menu className="h-5 w-5" />
              <span className="text-xs font-semibold">Menú</span>
            </Button>
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

        <main id="main-content" className="pb-6">
          <div key={location.pathname} className="app-page-enter">{children ?? <Outlet />}</div>
        </main>

        {AI_ASSISTANT_ENABLED && <AIAssistant />}

        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetContent side="left" className="w-[min(88vw,340px)] overflow-y-auto p-0 md:hidden">
            <SheetHeader className="border-b px-5 py-5 text-left">
              <div className="flex items-center gap-3 pr-8">
                <AppLogo className="h-10 w-10 rounded-xl" />
                <div className="min-w-0">
                  <SheetTitle className="text-base">{APP_SHORT_NAME}</SheetTitle>
                  <SheetDescription className="truncate text-xs">{APP_NAME}</SheetDescription>
                </div>
              </div>
            </SheetHeader>

            <nav className="space-y-5 px-3 py-5" aria-label="Módulos y secciones">
              {visibleGroups.map((group) => {
                const GroupIcon = group.icon;
                return (
                  <section key={group.modulo}>
                    <div className="mb-1.5 flex items-center gap-2 px-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                      <GroupIcon className="h-4 w-4 text-primary" />
                      {group.label}
                    </div>
                    <div className="space-y-1">
                      {group.items.map((item) => {
                        const active = isItemActive(item);
                        const ItemIcon = item.icon;
                        return (
                          <button
                            key={item.to}
                            type="button"
                            onClick={() => {
                              navigate(item.to);
                              setMobileMenuOpen(false);
                            }}
                            className={cn(
                              "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium transition-colors",
                              active
                                ? "bg-primary/10 text-primary"
                                : "text-foreground hover:bg-accent hover:text-accent-foreground",
                            )}
                          >
                            <span className={cn(
                              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                              active ? "bg-primary/15" : "bg-muted",
                            )}>
                              <ItemIcon className="h-4 w-4" />
                            </span>
                            <span>{item.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </nav>
          </SheetContent>
        </Sheet>
      </SidebarInset>
    </SidebarProvider>
  );
}
