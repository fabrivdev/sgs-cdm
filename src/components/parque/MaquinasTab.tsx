import { sortSalesRows, type SalesColumn } from "@/components/ventas/salesTableInteraction";
import { SectionActionsMenu } from "@/components/exports/SectionActionsMenu";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CompactListInfo, CompactListTable, type CompactListColumn } from "@/components/lists/CompactListTable";
import { ArrowRightLeft, Plus } from "lucide-react";
import { MarcaBadge } from "@/components/StatusBadges";
import { SUCURSALES, type Sucursal } from "@/lib/constants";
import { FiltersBar, FilterSelect, FilterCustom } from "@/components/filters/FiltersBar";
import { cn } from "@/lib/utils";
import { TransferirMaquinaDialog, type MaquinaParaTransferir } from "./TransferirMaquinaDialog";
import { NuevaMaquinaDialog } from "./NuevaMaquinaDialog";
import { MACHINE_SUBGROUPS, machineSubgroupLabel } from "@/lib/machineModels";
import { useAuth } from "@/hooks/useAuth";
import { useMachineCatalog } from "@/hooks/useMachineCatalog";
import { reviewCatalogLine } from "@/lib/machineOrderValidation";

const MARCA_AMBAS = "ambas";
type Maquina = {
  id: string;
  cliente_id: string | null;
  anio: number | null;
  marca: string;
  marca_nombre: string | null;
  subgrupo: string;
  subgrupo_personalizado: string | null;
  modelo_tipo: string | null;
  serie: string;
  vendedor: string | null;
  sucursal: Sucursal | null;
  localidad: string | null;
  activo: boolean | null;
  agregado_manualmente?: boolean | null;
  notas?: string | null;
  creado_en?: string | null;
  actualizado_en?: string | null;
};

type Cliente = {
  id: string;
  nombre: string;
  sucursal: Sucursal | null;
  ruc?: string | null;
  region?: string | null;
  direccion?: string | null;
  localidad?: string | null;
  correo_principal?: string | null;
  cod_entidad?: string | null;
  activo?: boolean | null;
};

type SortKey = "cliente" | "marca" | "subgrupo" | "año" | "serie" | "sucursal" | "modelo" | "antiguedad" | "vendedor" | "estado";

const PAGE = 1000;

type PaginableQuery<T> = {
  range: (from: number, to: number) => PromiseLike<{
    data: T[] | null;
    error: { message?: string } | null;
  }>;
};

async function cargarTodo<T>(queryBuilder: PaginableQuery<T>): Promise<T[]> {
  let from = 0;
  const all: T[] = [];

  while (true) {
    const { data, error } = await queryBuilder.range(from, from + PAGE - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    all.push(...(data as T[]));

    if (data.length < PAGE) break;
    from += PAGE;
  }

  return all;
}

export type MaquinasResumen = {
  totalMaquinas: number;
  totalClientes: number;
  totalHorsch: number;
  totalClaas: number;
};

export function MaquinasTab({
  onOpenCliente,
  onResumenChange,
}: {
  onOpenCliente?: (id: string) => void;
  onResumenChange?: (resumen: MaquinasResumen) => void;
}) {
  const { can } = useAuth();
  const canManagePark = can("parque:gestionar");
  const canExport = can("datos:exportar");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [rawMaquinas, setMaquinas] = useState<Maquina[]>([]);
  const catalog = useMachineCatalog();
  const maquinas = useMemo(() => rawMaquinas.map(machine => {
    const match = catalog.data ? reviewCatalogLine({ marca: machine.marca, modelo: machine.modelo_tipo ?? "", subgrupo: machine.subgrupo }, catalog.data).match : undefined;
    return match ? { ...machine, modelo_tipo: match.nombre, subgrupo: match.subgrupo } : machine;
  }), [rawMaquinas, catalog.data]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [transferMaquina, setTransferMaquina] = useState<MaquinaParaTransferir | null>(null);
  const [nuevaMaquinaOpen, setNuevaMaquinaOpen] = useState(false);

  const [q, setQ] = useState("");
  const [fSucursal, setFSucursal] = useState("all");
  const [fMarca, setFMarca] = useState("all");
  const [fSubgrupo, setFSubgrupo] = useState("all");
  const [fEstado, setFEstado] = useState("activa");
  const [añoDesde, setAñoDesde] = useState("");
  const [añoHasta, setAñoHasta] = useState("");

  const [sortKey, setSortKey] = useState<SortKey>("cliente");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const cargar = useCallback(async () => {
    setLoading(true);
    setLoadError(false);

    try {
      const [m, c] = await Promise.all([
        cargarTodo<Maquina>(
          supabase
            .from("parque_maquinas")
            .select("id, cliente_id, anio, marca, marca_nombre, subgrupo, subgrupo_personalizado, modelo_tipo, serie, vendedor, sucursal, localidad, activo, agregado_manualmente, notas, creado_en, actualizado_en")
            .order("id"),
        ),
        cargarTodo<Cliente>(
          supabase
            .from("clientes")
            .select("id, nombre, sucursal, ruc, region, direccion, localidad, correo_principal, cod_entidad, activo")
            .order("nombre", { ascending: true }).order("id"),
        ),
      ]);

      const normalized = m.map((machine) => ({ ...machine, marca: machine.marca_nombre || (machine.marca === "OTROS" ? "Sin marca" : machine.marca) }));
      setMaquinas(normalized);
      setClientes(c);
      const activas = normalized.filter((maquina) => maquina.activo !== false);
      onResumenChange?.({
        totalMaquinas: activas.length,
        totalClientes: new Set(activas.map((maquina) => maquina.cliente_id).filter(Boolean)).size,
        totalHorsch: activas.filter((maquina) => maquina.marca === "HORSCH").length,
        totalClaas: activas.filter((maquina) => maquina.marca === "CLAAS").length,
      });
    } catch (e) {
      setLoadError(true);
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [onResumenChange]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const cliById = useMemo(() => {
    const map = new Map<string, Cliente>();
    for (const c of clientes) map.set(c.id, c);
    return map;
  }, [clientes]);

  const clientesConAmbasMarcas = useMemo(() => {
    const marcasByCliente = new Map<string, Set<string>>();

    for (const m of maquinas) {
      if (!m.cliente_id) continue;
      const activa = m.activo !== false;
      if (fEstado === "activa" && !activa) continue;
      if (fEstado === "inactiva" && activa) continue;

      const marcas = marcasByCliente.get(m.cliente_id) ?? new Set<string>();
      marcas.add(m.marca);
      marcasByCliente.set(m.cliente_id, marcas);
    }

    const clientes = new Set<string>();
    for (const [clienteId, marcas] of marcasByCliente) {
      if (marcas.has("CLAAS") && marcas.has("HORSCH")) clientes.add(clienteId);
    }
    return clientes;
  }, [maquinas, fEstado]);

  const subgrupoOptions = useMemo(() => {
    const values = new Set<string>(MACHINE_SUBGROUPS.filter((subgrupo) => subgrupo !== "OTRO"));
    for (const maquina of maquinas) {
      values.add(machineSubgroupLabel(maquina.subgrupo, maquina.subgrupo_personalizado));
    }
    return Array.from(values)
      .sort((a, b) => a.localeCompare(b, "es"))
      .map((value) => ({ value, label: value === "OTRO" ? "OTRO (SIN ESPECIFICAR)" : value }));
  }, [maquinas]);

  const marcaOptions = useMemo(() => [
    { value: "all", label: "Todos" },
    { value: MARCA_AMBAS, label: "C/Ambas" },
    ...Array.from(new Set(maquinas.map((machine) => machine.marca))).sort((a, b) => a.localeCompare(b, "es")).map((brand) => ({ value: brand, label: brand })),
  ], [maquinas]);

  const filtradas = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const ad = añoDesde ? Number(añoDesde) : null;
    const ah = añoHasta ? Number(añoHasta) : null;

    return maquinas.filter((m) => {
      const activa = m.activo !== false;

      if (fEstado === "activa" && !activa) return false;
      if (fEstado === "inactiva" && activa) return false;
      if (fSucursal !== "all" && m.sucursal !== fSucursal) return false;
      if (fMarca === MARCA_AMBAS) {
        if (!m.cliente_id || !clientesConAmbasMarcas.has(m.cliente_id)) return false;
      } else if (fMarca !== "all" && m.marca !== fMarca) return false;
      if (fSubgrupo !== "all" && machineSubgroupLabel(m.subgrupo, m.subgrupo_personalizado) !== fSubgrupo) return false;
      if (ad != null && (m.anio == null || m.anio < ad)) return false;
      if (ah != null && (m.anio == null || m.anio > ah)) return false;

      if (ql) {
        const cli = m.cliente_id ? cliById.get(m.cliente_id)?.nombre ?? "" : "";
        const hay =
          cli.toLowerCase().includes(ql) ||
          (m.serie ?? "").toLowerCase().includes(ql) ||
          (m.modelo_tipo ?? "").toLowerCase().includes(ql);

        if (!hay) return false;
      }

      return true;
    });
  }, [maquinas, cliById, q, fSucursal, fMarca, fSubgrupo, fEstado, añoDesde, añoHasta, clientesConAmbasMarcas]);

  const columns: SalesColumn<typeof filtradas[number]>[] = [
    { key: "cliente", label: "Cliente", kind: "text", value: m => m.cliente_id ? cliById.get(m.cliente_id)?.nombre : null },
    { key: "sucursal", label: "Sucursal", kind: "text", value: m => m.sucursal },
    { key: "marca", label: "Marca", kind: "text", value: m => m.marca },
    { key: "subgrupo", label: "Tipo", kind: "text", value: m => machineSubgroupLabel(m.subgrupo, m.subgrupo_personalizado) },
    { key: "modelo", label: "Modelo", kind: "text", value: m => m.modelo_tipo },
    { key: "año", label: "Año", kind: "number", align: "center", value: m => m.anio },
    { key: "antiguedad", label: "Antig.", kind: "number", align: "center", value: m => m.anio ? new Date().getFullYear() - m.anio : null },
    { key: "serie", label: "Chasis", kind: "text", value: m => m.serie },
    { key: "vendedor", label: "Vendedor", kind: "text", value: m => m.vendedor },
    { key: "estado", label: "Estado", kind: "text", value: m => m.activo === false ? "Inactiva" : "Activa" },
  ];
  const ordenadas = sortSalesRows(filtradas, columns, { key: sortKey, direction: sortDir });

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(k);
      setSortDir("asc");
    }
  };


  const exportar = async () => {
    const XLSX = await import("xlsx");
    const hoy = new Date().getFullYear();

    const data = ordenadas.map((m) => {
      const activa = m.activo !== false;
      const cli = m.cliente_id ? cliById.get(m.cliente_id) : null;

      return {
        Cliente: cli?.nombre ?? "",
        "Cod. Entidad": cli?.cod_entidad ?? "",
        RUC: cli?.ruc ?? "",
        "Sucursal Cliente": cli?.sucursal ?? "",
        Region: cli?.region ?? "",
        "Direccion Cliente": cli?.direccion ?? "",
        "Localidad Cliente": cli?.localidad ?? "",
        "Correo Cliente": cli?.correo_principal ?? "",
        "Cliente Activo": cli ? (cli.activo === false ? "No" : "Si") : "",
        Sucursal: m.sucursal ?? "",
        Localidad: m.localidad ?? "",
        Marca: m.marca,
        Subgrupo: machineSubgroupLabel(m.subgrupo, m.subgrupo_personalizado),
        Modelo: m.modelo_tipo ?? "",
        Año: m.anio ?? "",
        "Antig.": m.anio ? hoy - m.anio : "",
        Serie: m.serie,
        Vendedor: m.vendedor ?? "",
        Estado: activa ? "Activa" : "Inactiva",
        "Agregado Manualmente": m.agregado_manualmente ? "Si" : "No",
        Notas: m.notas ?? "",
        "Creado en": m.creado_en ?? "",
        "Actualizado en": m.actualizado_en ?? "",
        "ID Maquina": m.id,
        "ID Cliente": m.cliente_id ?? "",
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(wb, ws, "Maquinas");
    XLSX.writeFile(wb, `maquinas-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const hoy = new Date().getFullYear();

  const limpiar = () => {
    setQ(""); setFSucursal("all"); setFMarca("all"); setFSubgrupo("all");
    setFEstado("activa"); setAñoDesde(""); setAñoHasta("");
  };
  const activos =
    (q ? 1 : 0) + (fSucursal !== "all" ? 1 : 0) + (fMarca !== "all" ? 1 : 0) +
    (fSubgrupo !== "all" ? 1 : 0) + (fEstado !== "activa" ? 1 : 0) +
    (añoDesde ? 1 : 0) + (añoHasta ? 1 : 0);

  return (
    <div className="space-y-3">
      <FiltersBar
        search={{ value: q, onChange: setQ, placeholder: "Cliente, serie o modelo…", label: "Buscar", width: "w-[190px]" }}
        activeCount={activos}
        onClear={limpiar}
        meta={`${ordenadas.length} máquina${ordenadas.length !== 1 ? "s" : ""}`}
        secondaryActions={canExport ? <SectionActionsMenu options={[{ id: "excel", label: "Exportar máquinas", disabled: loading || loadError || !ordenadas.length, onSelect: exportar }]} /> : undefined}
        actions={
          <div className="flex items-center gap-2">
            {canManagePark && <Button size="sm" onClick={() => setNuevaMaquinaOpen(true)} className="h-9 shrink-0 px-3">
              <Plus className="mr-1 h-4 w-4" /> Nueva
            </Button>}
          </div>
        }
        expanded={
          <div className="flex flex-col gap-3">
            <FilterCustom label="Año desde" width="w-full">
              <Input type="number" value={añoDesde} onChange={(e) => setAñoDesde(e.target.value)} className="h-8 text-[12px]" placeholder="2010" />
            </FilterCustom>
            <FilterCustom label="Año hasta" width="w-full">
              <Input type="number" value={añoHasta} onChange={(e) => setAñoHasta(e.target.value)} className="h-8 text-[12px]" placeholder={String(hoy)} />
            </FilterCustom>
            <FilterSelect
              label="Estado" value={fEstado} onChange={setFEstado} placeholder="Estado" width="w-full"
              options={[{ value: "activa", label: "Activas" }, { value: "inactiva", label: "Inactivas" }, { value: "all", label: "Todos" }]}
            />
          </div>
        }
      >
        <FilterSelect
          label="Sucursal" value={fSucursal} onChange={setFSucursal} placeholder="Sucursal" width="w-[120px]"
          options={[{ value: "all", label: "Todos" }, ...SUCURSALES.map(s => ({ value: s, label: s }))]}
        />
        <FilterSelect
          label="Marca" value={fMarca} onChange={setFMarca} placeholder="Marca" width="w-[110px]"
          options={marcaOptions}
        />
        <FilterSelect
          label="Subgrupo" value={fSubgrupo} onChange={setFSubgrupo} placeholder="Subgrupo" width="w-[145px]"
          options={[{ value: "all", label: "Todos" }, ...subgrupoOptions]}
        />
      </FiltersBar>


      <div className="overflow-hidden rounded-md border bg-card">
        <CompactListTable rows={ordenadas} id={m=>m.id} label="Máquinas del parque" sort={{key:sortKey,direction:sortDir}} onSort={key=>toggleSort(key as SortKey)}
          status={loading?"Cargando…":loadError?<span className="text-destructive">No se pudieron cargar las máquinas.</span>:!ordenadas.length?"Sin máquinas.":undefined}
          onSelect={onOpenCliente?m=>m.cliente_id&&onOpenCliente(m.cliente_id):undefined} rowClassName={m=>m.activo===false?"opacity-60":""}
          columns={columns.map(column=>{
            const layout:Record<string,Pick<CompactListColumn<Maquina>,"width"|"hiddenBelow">>={
              cliente:{width:"w-[35%] md:w-[22%] lg:w-[18%]"},sucursal:{width:"md:w-[12%] lg:w-[8%]",hiddenBelow:"md"},
              marca:{width:"w-[17%] md:w-[9%] lg:w-[7%]"},subgrupo:{width:"lg:w-[11%]",hiddenBelow:"lg"},
              modelo:{width:"w-[40%] md:w-[25%] lg:w-[15%]"},año:{width:"lg:w-[5%]",hiddenBelow:"lg"},
              antiguedad:{width:"lg:w-[5%]",hiddenBelow:"lg"},serie:{width:"md:w-[21%] lg:w-[14%]",hiddenBelow:"md"},
              vendedor:{width:"lg:w-[8%]",hiddenBelow:"lg"},estado:{width:"md:w-[7%] lg:w-[6%]",hiddenBelow:"md"},
            };
            return {...column,...layout[column.key],className:column.key==="serie"?"font-mono":undefined,
              render:(m:Maquina)=>{
                const cli=m.cliente_id?cliById.get(m.cliente_id):null;
                if(column.key==="marca")return <MarcaBadge marca={m.marca} className="max-w-full whitespace-nowrap text-[10px]" />;
                if(column.key==="cliente"&&cli&&onOpenCliente)return <button type="button" className="max-w-full truncate text-left font-medium focus-visible:ring-2 focus-visible:ring-ring" onClick={event=>{event.stopPropagation();onOpenCliente(cli.id);}}>{cli.nombre}</button>;
                if(column.key==="modelo")return <CompactListInfo label={m.modelo_tipo??"—"} fields={columns.map(c=>[c.key==="antiguedad"?"Antig. (años)":c.label,String(c.value(m)??"—")] as const)} />;
                if(column.key==="estado")return <Badge variant={m.activo!==false?"default":"secondary"} className="max-w-full whitespace-nowrap px-2 text-[10px]">{m.activo!==false?"Activa":"Inactiva"}</Badge>;
                return String(column.value(m)??"—");
              }};
          })}
          actions={{width:"w-[8%] md:w-[4%] lg:w-[3%]",render:m=>{
            const activa=m.activo!==false;
            return <>                      {activa && canManagePark && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 max-w-full"
                          title="Transferir a otro cliente"
                          aria-label={`Transferir ${m.serie}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            setTransferMaquina({
                              id: m.id,
                              clienteIdActual: m.cliente_id,
                              marca: m.marca,
                              modelo_tipo: m.modelo_tipo,
                              serie: m.serie,
                              anio: m.anio,
                              subgrupo: m.subgrupo,
                              subgrupo_personalizado: m.subgrupo_personalizado,
                              notas: m.notas ?? null,
                            });
                          }}
                        >
                          <ArrowRightLeft className="h-3.5 w-3.5" />
                        </Button>
                      )}</>;
          }}} />
      </div>
      {canManagePark && <TransferirMaquinaDialog
        maquina={transferMaquina}
        clienteNombreActual={transferMaquina?.clienteIdActual ? cliById.get(transferMaquina.clienteIdActual)?.nombre ?? "Cliente actual" : "Sin cliente"}
        open={!!transferMaquina}
        onOpenChange={(open) => { if (!open) setTransferMaquina(null); }}
        onTransferred={async () => {
          setTransferMaquina(null);
          await cargar();
        }}
      />}
      {canManagePark && <NuevaMaquinaDialog
        open={nuevaMaquinaOpen}
        onOpenChange={setNuevaMaquinaOpen}
        onCreated={cargar}
      />}
    </div>
  );
}


