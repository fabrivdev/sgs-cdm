import { File as NodeFile } from "node:buffer";
import { webcrypto } from "node:crypto";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImportarTotvsTab } from "./ImportarTotvsTab";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), invalidateQueries: vi.fn(), error: vi.fn(), success: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "test-user" } }) }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }) }));
vi.mock("sonner", () => ({ toast: { error: mocks.error, success: mocks.success, info: vi.fn(), warning: vi.fn() } }));
const headers = [
  "Suc. Orig", "DOCUMENTO", "Tipo", "SERIE", "CUOTA", "Fch Emision", "Vencimiento",
  "VALOR", "SALDO", "Moneda", "Tasa moneda", "Modalidad", "CLIENTE", "Nombre", "ASESOR",
  "Vencto Orig", "Condicion",
];

function xmlFile() {
  const cells = (values: string[]) => values.map((value) => `<Cell><Data>${value}</Data></Cell>`).join("");
  const values = ["01", "100", "NF", "FE1", "1", "2026-10-07T00:00:00", "2026-10-06T00:00:00", "100", "80", "2", "1", "001", "CLI-1", "Cliente", "Asesor", "2026-10-06T00:00:00", "Credito"];
  const xml = `<?xml version="1.0"?><Workbook><Worksheet><Table><Row>${cells(headers)}</Row><Row>${cells(values)}</Row><Row>${cells(["Totales"])}</Row></Table></Worksheet></Workbook>`;
  return new NodeFile([xml], "cuentas_por_cobrar_a_la_fecha_120000.xml", {
    type: "application/xml",
    lastModified: new Date(2026, 9, 7, 12).getTime(),
  }) as unknown as File;
}


beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("crypto", webcrypto);
  mocks.rpc.mockImplementation(async (name, params) => {
    if (name === "totvs_iniciar_cxc_carga_v1") return { data: { carga_id: "load-1", estado: "VALIDANDO", snapshot_version: 1 }, error: null };
    if (name === "totvs_importar_cxc_lote_v1") return { data: { conflictos: 0, insertadas: params.p_filas.length, vinculadas: params.p_filas.length }, error: null };
    return { data: { estado: "COMPLETA" }, error: null };
  });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function selectFiles(files = [xmlFile()]) {
  const onChanged = vi.fn();
  const { container } = render(<ImportarTotvsTab onChanged={onChanged} />);
  fireEvent.change(container.querySelector('input[type="file"][accept=".xml"]')!, { target: { files } });
  return onChanged;
}
async function read() {
  fireEvent.change(screen.getByLabelText("Corte de Cuentas por cobrar"), { target: { value: "2026-10-15" } });
  fireEvent.click(screen.getByRole("button", { name: "Leer archivos" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Confirmar importación" })).toBeEnabled());
}
it("el flujo visible lee y persiste CxC sin otros archivos", async () => {
  const changed = selectFiles();
  await read();
  expect(mocks.rpc).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Confirmar importación" }));
  await waitFor(() => expect(changed).toHaveBeenCalledOnce());
  expect(mocks.rpc.mock.calls.map(call => call[0])).toEqual(["totvs_iniciar_cxc_carga_v1", "totvs_importar_cxc_lote_v1", "totvs_importar_cxc_lote_v1", "totvs_finalizar_cxc_carga_v1"]);
  expect(mocks.rpc.mock.calls[0][1].p_metadata).toMatchObject({ fecha_corte: "2026-10-15", corte_evidencia: "USER_CONFIRMED" });
});
it("no informa éxito si falla la finalización y cancela la carga", async () => {
  const changed = selectFiles();
  const original = mocks.rpc.getMockImplementation()!;
  mocks.rpc.mockImplementation((name, params) => name === "totvs_finalizar_cxc_carga_v1" ? Promise.resolve({ data: null, error: { message: "Control no conciliado" } }) : original(name, params));
  await read();
  fireEvent.click(screen.getByRole("button", { name: "Confirmar importación" }));
  await waitFor(() => expect(mocks.error).toHaveBeenCalled());
  expect(changed).not.toHaveBeenCalled();
  expect(mocks.rpc.mock.calls.at(-1)?.[0]).toBe("totvs_cancelar_cxc_carga_v1");
});
it("exige corte cuando no hay propiedad interna", async () => {
  selectFiles();
  fireEvent.click(screen.getByRole("button", { name: "Leer archivos" }));
  expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining("fecha de corte"));
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it("rechaza dos fotos de CxC para no mezclar saldos", async () => {
  selectFiles([xmlFile(), new NodeFile([await xmlFile().text()], "cuentas_por_cobrar_a_la_fecha_130000.xml") as unknown as File]);
  fireEvent.click(screen.getByRole("button", { name: "Leer archivos" }));
  expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining("único XML"));
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("propone el corte interno y permite corregirlo", async () => {
  const xml = (await xmlFile().text()).replace("<Workbook>", "<Workbook><DocumentProperties><Created>2026-10-15T11:43:05Z</Created></DocumentProperties>");
  selectFiles([new NodeFile([xml], "cuentas_por_cobrar_a_la_fecha_114844.xml") as unknown as File]);
  await waitFor(() => expect(screen.getByLabelText("Corte de Cuentas por cobrar")).toHaveValue("2026-10-15"));
  fireEvent.change(screen.getByLabelText("Corte de Cuentas por cobrar"), { target: { value: "2026-10-14" } });
  expect(screen.getByLabelText("Corte de Cuentas por cobrar")).toHaveValue("2026-10-14");
});
