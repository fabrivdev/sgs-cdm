import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { render, selectExport } from "./salesSectionExports.test-support";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ServiciosTecnicos } from "./ServiciosTecnicos";
import { displayImportedTechnicianName } from "@/lib/technicianMatching";
const { rpc, exportTable }=vi.hoisted(()=>({rpc:vi.fn(),exportTable:vi.fn()}));
vi.mock("@/integrations/supabase/client",()=>({supabase:{rpc}}));
vi.mock("@/hooks/useAuth",()=>({useAuth:()=>({can:()=>true})}));
vi.mock("@/hooks/useServicioTecnicos",()=>({useServicioTecnicos:()=>({data:[]})}));
vi.mock("./salesTableExport",()=>({exportSalesTable:exportTable}));
const props={desde:"2026-08-01",hasta:"2026-08-31",sucursal:"TODAS",buscar:"",tipoTiempo:"TODOS"};
const row={tecnico_clave:"a",tecnico:"Técnico Á",horas_cliente:3,horas_garantia:2,horas_interno:0,horas_otros:1,total_horas:6,mo_cliente:75,mo_garantia:20,mo_interno:0,mo_otros:5,mo_total:100};
afterEach(()=>{cleanup();vi.clearAllMocks();});
describe("service technician table",()=>{
  it("shows unclassified components and filters only this table without recalculating participation",async()=>{
    rpc.mockResolvedValue({data:[row,{...row,tecnico_clave:"b",tecnico:"Técnico B",mo_total:200,total_horas:9}],error:null});
    render(<ServiciosTecnicos {...props} filtros={{documento:"nc"}} />);
    await screen.findByText(displayImportedTechnicianName(row.tecnico));
    expect(screen.getByRole("columnheader",{name:"Horas sin clasificar"})).toBeInTheDocument();
    expect(screen.getByRole("columnheader",{name:"MO sin clasificar"})).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox",{name:"Filtrar técnico en esta tabla"}),{target:{value:"tecnico a"}});
    expect(screen.queryByText(displayImportedTechnicianName("Técnico B"))).not.toBeInTheDocument();
    expect(screen.getByText("$ 100")).toBeInTheDocument();
    await selectExport();
    await waitFor(()=>expect(exportTable).toHaveBeenCalled());
    expect(exportTable.mock.calls[0][0].rows).toEqual([{...row,tecnico:displayImportedTechnicianName(row.tecnico)}]);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("ventas_servicios_tecnicos_v1_filtrado",expect.objectContaining({p_filtros:{documento:"nc"}}));
  });
  it("leaves loading on a rejected request and does not export stale data",async()=>{
    rpc.mockRejectedValue(new Error("Network offline"));
    render(<ServiciosTecnicos {...props} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Network offline");
    expect(screen.queryByText("Cargando técnicos…")).not.toBeInTheDocument();
    expect(screen.queryByRole("button",{name:"Acciones de la sección"})).not.toBeInTheDocument();
  });
});
