import { describe, expect, it, vi, afterEach } from "vitest";
import { loadServiceDetailMachines } from "./serviceDetailMachines";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
afterEach(() => vi.resetAllMocks());
function respond(data: unknown, error: unknown = null) {
  const query = { in: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), range: vi.fn().mockResolvedValue({data,error}) };
  rpc.mockReturnValue(query);
  return query;
}
describe("service detail machine export enrichment", () => {
  it("uses canonical machine identity, preserves financial rows, duplicates and missing machines", async () => {
    const query = respond([{chasis_clave:"AB01",marca_parque:"CLAAS",modelo_tipo:"LEXION 770"}]);
    const rows = [{id:"a",chasis:"ab-01",marca:"Marca del repuesto",modelo:"Repuesto"},
      {id:"b",chasis:"AB 01",marca:"Otra"}, {id:"c",chasis:null}, {id:"d",chasis:"unknown"}];
    const result = await loadServiceDetailMachines(rows);
    expect(result.map(r=>r.id)).toEqual(["a","b","c","d"]);
    expect(result.slice(0,2).map(r=>[r.marca_maquina,r.modelo_maquina])).toEqual([["CLAAS","LEXION 770"],["CLAAS","LEXION 770"]]);
    expect(result.slice(2).map(r=>[r.marca_maquina,r.modelo_maquina])).toEqual([[null,null],[null,null]]);
    expect(rows[0]).not.toHaveProperty("marca_maquina");
    expect(query.in).toHaveBeenCalledWith("chasis_clave",["AB01","UNKNOWN"]);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("ventas_servicios_maquinas_identidad");
  });
  it("batches unique chassis below the server row limit", async () => {
    const query = respond([]);
    const rows = Array.from({length:205},(_,i)=>({chasis:`CH${i}`}));
    expect(await loadServiceDetailMachines(rows)).toHaveLength(205);
    expect(query.in.mock.calls.map(call=>call[1].length)).toEqual([100,100,5]);
    expect(query.range).toHaveBeenCalledWith(0,99);
  });
  it("keeps ambiguous canonical fields empty and skips reads without chassis", async () => {
    respond([{chasis_clave:"A",marca_parque:null,modelo_tipo:null}]);
    expect(await loadServiceDetailMachines([{chasis:"A"}])).toEqual([{chasis:"A",marca_maquina:null,modelo_maquina:null}]);
    rpc.mockClear();
    await loadServiceDetailMachines([{chasis:null},{chasis:" - "}]);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("rejects failed, malformed or duplicate identities rather than exporting partial data", async () => {
    respond(null,{message:"denied"});
    await expect(loadServiceDetailMachines([{chasis:"A"}])).rejects.toEqual({message:"denied"});
    respond({});
    await expect(loadServiceDetailMachines([{chasis:"A"}])).rejects.toThrow("invalida");
    respond([{chasis_clave:"A"},{chasis_clave:"A"}]);
    await expect(loadServiceDetailMachines([{chasis:"A"}])).rejects.toThrow("duplicada");
  });
});
