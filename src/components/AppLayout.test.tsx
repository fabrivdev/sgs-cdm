import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";
import { AppLayout } from "./AppLayout";

const { auth } = vi.hoisted(() => ({ auth: {
  user: null, profile: { nombre: "Usuario Demo", sucursal: "Santa Rita" }, isAdmin: true,
  roles: ["admin"], moduloAccess: ["parque", "servicios", "repuestos"],
  can: vi.fn(() => true), hasModuloAccess: vi.fn((_module: string) => true),
  hasSectionAccess: vi.fn((_section: string) => true), signOut: vi.fn(),
} }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => auth }));
vi.mock("@/hooks/useUnseen", () => ({ useUnseen: () => 12 }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => true }));
vi.mock("@/components/assistant/AIAssistant", () => ({ AIAssistant: () => null }));
vi.mock("@/components/parque/MachineSaleNotificationDialog", () => ({ MachineSaleNotificationDialog: () => null }));
vi.mock("@/components/parque/MachineStockReturnNotificationDialog", () => ({ MachineStockReturnNotificationDialog: () => null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  auth.isAdmin = true;
  auth.hasModuloAccess.mockReturnValue(true);
  auth.hasSectionAccess.mockReturnValue(true);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
function Content() { return <p>Ruta: {useLocation().pathname}</p>; }
function setup(path = "/parque-ventas") {
  render(<MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><AppLayout><Content /></AppLayout></MemoryRouter>);
}

describe("shared mobile header", () => {
  it.each(["/parque-ventas", "/servicios/ventas", "/repuestos/ventas", "/parque-stock"])("groups the logo and name on %s with named icon controls", path => {
    setup(path);
    const header = within(screen.getByRole("banner"));
    const logo = header.getByRole("img", { name: "Remolino CDM" });
    expect(logo).toHaveAttribute("src", "/sig-cdm-logo.png");
    expect(logo.parentElement).toHaveTextContent("SIG CDM");
    expect(header.queryByText("Menú", { exact: true })).not.toBeInTheDocument();
    expect(header.getByRole("button", { name: "Abrir menú de módulos" })).toHaveAttribute("aria-expanded", "false");
    expect(header.getByRole("button", { name: "Notificaciones" })).toHaveTextContent("12");
    expect(header.getByRole("button", { name: "Abrir menú de cuenta" })).toBeInTheDocument();
  });
  it("opens the module drawer, navigates and closes it", async () => {
    setup();
    const menu = screen.getByRole("button", { name: "Abrir menú de módulos" });
    fireEvent.click(menu);
    expect(menu).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(within(screen.getByRole("navigation", { name: "Módulos y secciones" })).getByRole("button", { name: "Stock" }));
    await screen.findByText("Ruta: /parque-stock");
    await waitFor(() => expect(screen.queryByRole("navigation", { name: "Módulos y secciones" })).not.toBeInTheDocument());
    expect(menu).toHaveAttribute("aria-expanded", "false");
  });
  it("keeps account actions accessible by keyboard", async () => {
    setup();
    fireEvent.keyDown(screen.getByRole("button", { name: "Abrir menú de cuenta" }), { key: "Enter" });
    expect(await screen.findByRole("menuitem", { name: "Administración" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "Cerrar sesión" }));
    expect(auth.signOut).toHaveBeenCalledOnce();
  });
  it("opens the notification panel without changing its contents", async () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Notificaciones" }));
    expect(await screen.findByText("No hay notificaciones pendientes.")).toBeInTheDocument();
  });
  it("does not expose sections or administration without permission", async () => {
    auth.isAdmin = false;
    auth.hasModuloAccess.mockImplementation(module => module === "parque");
    auth.hasSectionAccess.mockImplementation(section => section === "parque.ventas");
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Abrir menú de módulos" }));
    const nav = within(screen.getByRole("navigation", { name: "Módulos y secciones" }));
    expect(nav.getAllByRole("button")).toHaveLength(1);
    expect(nav.getByRole("button", { name: "Ventas" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.keyDown(screen.getByRole("button", { name: "Abrir menú de cuenta" }), { key: "Enter" });
    await screen.findByRole("menuitem", { name: "Cerrar sesión" });
    expect(screen.queryByRole("menuitem", { name: "Administración" })).not.toBeInTheDocument();
  });
});
