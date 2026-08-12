import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowDown, ArrowRightLeft, ArrowUp, ArrowUpDown, Download, Plus } from "lucide-react";
import { MarcaBadge } from "@/components/StatusBadges";
import { SUCURSALES, MARCAS, type Marca, type Sucursal } from "@/lib/constants";
import { FiltersBar, FilterSelect, FilterCustom } from "@/components/filters/FiltersBar";
import { cn } from "@/lib/utils";
import { TransferirMaquinaDialog, type MaquinaParaTransferir } from "./TransferirMaquinaDialog";
import { NuevaMaquinaDialog } from "./NuevaMaquinaDialog";
import { MACHINE_SUBGROUPS, normalizeMachineModelKey } from "@/lib/machineModels";
import * as XLSX from "xlsx";

const MARCA_AMBAS = "ambas";
const MARCA_OPTIONS = [
  { value: "all", label: "Todos" },
  { value: MARCA_AMBAS, label: "C/Ambas" },
  ...MARCAS.map((m) => ({ value: m, label: m })),
];

type Maquina = {
  id: string;
  cliente_id: string | null;
  anio: number | null;
  marca: Marca;
  subgrupo: string;
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

type SortKey = "cliente" | "marca" | "subgrupo" | "año" | "serie" | "sucursal";

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
  totalModelos: number;
};

export function MaquinasTab({
  onOpenCliente,
  onResumenChange,
}: {
  onOpenCliente?: (id: string) => void;
  onResumenChange?: (resumen: MaquinasResumen) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [maquinas, setMaquinas] = useState<Maquina[]>([]);
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

    try {
      const [m, c] = await Promise.all([
        cargarTodo<Maquina>(
          supabase
            .from("parque_maquinas")
            .select("id, cliente_id, anio, marca, subgrupo, modelo_tipo, serie, vendedor, sucursal, localidad, activo, agregado_manualmente, notas, creado_en, actualizado_en"),
        ),
        cargarTodo<Cliente>(
          supabase
            .from("clientes")
            .select("id, nombre, sucursal, ruc, region, direccion, localidad, correo_principal, cod_entidad, activo")
            .order("nombre", { ascending: true }),
        ),
      ]);

      setMaquinas(m);
      setClientes(c);
      const activas = m.filter((maquina) => maquina.activo !== false);
      onResumenChange?.({
        totalMaquinas: activas.length,
        totalClientes: new Set(activas.map((maquina) => maquina.cliente_id).filter(Boolean)).size,
        totalModelos: new Set(
          activas
            .map((maquina) => `${maquina.marca}|${maquina.subgrupo}|${normalizeMachineModelKey(maquina.modelo_tipo)}`)
            .filter((key) => !key.endsWith("|")),
        ).size,
      });
    } catch (e) {
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
    const marcasByCliente = new Map<string, Set<Marca>>();

    for (const m of maquinas) {
      if (!m.cliente_id) continue;
      const activa = m.activo !== false;
      if (fEstado === "activa" && !activa) continue;
      if (fEstado === "inactiva" && activa) continue;

      const marcas = marcasByCliente.get(m.cliente_id) ?? new Set<Marca>();
      marcas.add(m.marca);
      marcasByCliente.set(m.cliente_id, marcas);
    }

    const clientes = new Set<string>();
    for (const [clienteId, marcas] of marcasByCliente) {
      if (marcas.has("CLAAS") && marcas.has("HORSCH")) clientes.add(clienteId);
    }
    return clientes;
  }, [maquinas, fEstado]);

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
      if (fSubgrupo !== "all" && m.subgrupo !== fSubgrupo) return false;
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

  const ordenadas = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;

    return [...filtradas].sort((a, b) => {
      const cliA = a.cliente_id ? cliById.get(a.cliente_id)?.nombre ?? "" : "";
      const cliB = b.cliente_id ? cliById.get(b.cliente_id)?.nombre ?? "" : "";

      switch (sortKey) {
        case "cliente":
          return cliA.localeCompare(cliB) * dir;
        case "marca":
          return a.marca.localeCompare(b.marca) * dir;
        case "subgrupo":
          return (a.subgrupo ?? "").localeCompare(b.subgrupo ?? "") * dir;
        case "año":
          return ((a.anio ?? 0) - (b.anio ?? 0)) * dir;
        case "serie":
          return (a.serie ?? "").localeCompare(b.serie ?? "") * dir;
        case "sucursal":
          return (a.sucursal ?? "").localeCompare(b.sucursal ?? "") * dir;
      }
    });
  }, [filtradas, sortKey, sortDir, cliById]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(k);
      setSortDir("asc");
    }
  };

  const sortIcon = (k: SortKey) => {
    if (sortKey !== k) return <ArrowUpDown className="h-3 w-3 opacity-50" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };

  const exportar = () => {
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
        Subgrupo: m.subgrupo,
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
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={exportar}
              className="hidden h-9 w-9 shrink-0 sm:inline-flex"
              title="Exportar máquinas a Excel"
            >
              <Download className="h-4 w-4" />
              <span className="sr-only">Exportar máquinas</span>
            </Button>
            <Button size="sm" onClick={() => setNuevaMaquinaOpen(true)} className="h-9 shrink-0 px-3">
              <Plus className="mr-1 h-4 w-4" /> Nueva
            </Button>
          </div>
        }
      >
        <FilterSelect
          label="Sucursal" value={fSucursal} onChange={setFSucursal} placeholder="Sucursal" width="w-[120px]"
          options={[{ value: "all", label: "Todos" }, ...SUCURSALES.map(s => ({ value: s, label: s }))]}
        />
        <FilterSelect
          label="Marca" value={fMarca} onChange={setFMarca} placeholder="Marca" width="w-[110px]"
          options={MARCA_OPTIONS}
        />
        <FilterSelect
          label="Subgrupo" value={fSubgrupo} onChange={setFSubgrupo} placeholder="Subgrupo" width="w-[145px]"
          options={[{ value: "all", label: "Todos" }, ...MACHINE_SUBGROUPS.map(s => ({ value: s, label: s }))]}
        />
        <FilterCustom label="Año desde" width="w-[86px]">
          <Input type="number" value={añoDesde} onChange={(e) => setAñoDesde(e.target.value)} className="h-9 text-xs" placeholder="2010" />
        </FilterCustom>
        <FilterCustom label="Año hasta" width="w-[86px]">
          <Input type="number" value={añoHasta} onChange={(e) => setAñoHasta(e.target.value)} className="h-9 text-xs" placeholder={String(hoy)} />
        </FilterCustom>
        <FilterSelect
          label="Estado" value={fEstado} onChange={setFEstado} placeholder="Estado" width="w-[110px]"
          options={[
            { value: "activa", label: "Activas" },
            { value: "inactiva", label: "Inactivas" },
            { value: "all", label: "Todos" },
          ]}
        />
      </FiltersBar>


      <div className="rounded-md border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="cursor-pointer min-w-[200px]" onClick={() => toggleSort("cliente")}>
                <div className="flex items-center gap-1">Cliente {sortIcon("cliente")}</div>
              </TableHead>
              <TableHead className="cursor-pointer" onClick={() => toggleSort("sucursal")}>
                <div className="flex items-center gap-1">Sucursal {sortIcon("sucursal")}</div>
              </TableHead>
              <TableHead className="cursor-pointer" onClick={() => toggleSort("marca")}>
                <div className="flex items-center gap-1">Marca {sortIcon("marca")}</div>
              </TableHead>
              <TableHead className="cursor-pointer" onClick={() => toggleSort("subgrupo")}>
                <div className="flex items-center gap-1">Subgrupo {sortIcon("subgrupo")}</div>
              </TableHead>
              <TableHead>Modelo</TableHead>
              <TableHead className="cursor-pointer text-center" onClick={() => toggleSort("año")}>
                <div className="flex items-center justify-center gap-1">Año {sortIcon("año")}</div>
              </TableHead>
              <TableHead className="text-center">Antig.</TableHead>
              <TableHead className="cursor-pointer" onClick={() => toggleSort("serie")}>
                <div className="flex items-center gap-1">Serie {sortIcon("serie")}</div>
              </TableHead>
              <TableHead>Vendedor</TableHead>
              <TableHead className="text-center">Estado</TableHead>
              <TableHead className="w-[64px] text-right">Acción</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={11} className="h-20 text-center text-muted-foreground">
                  Cargando...
                </TableCell>
              </TableRow>
            )}

            {!loading && ordenadas.length === 0 && (
              <TableRow>
                <TableCell colSpan={11} className="h-20 text-center text-muted-foreground">
                  Sin máquinas.
                </TableCell>
              </TableRow>
            )}

            {!loading &&
              ordenadas.map((m) => {
                const cli = m.cliente_id ? cliById.get(m.cliente_id) : null;
                const antig = m.anio ? hoy - m.anio : null;
                const activa = m.activo !== false;

                return (
                  <TableRow
                    key={m.id}
                    className={cn(onOpenCliente && cli && "cursor-pointer hover:bg-accent/40", !activa && "opacity-60")}
                    onClick={() => cli && onOpenCliente?.(cli.id)}
                  >
                    <TableCell className="font-medium">{cli?.nombre ?? "—"}</TableCell>
                    <TableCell className="text-xs">{m.sucursal ?? "—"}</TableCell>
                    <TableCell>
                      <MarcaBadge marca={m.marca} className="text-[10px]" />
                    </TableCell>
                    <TableCell className="text-xs">{m.subgrupo}</TableCell>
                    <TableCell className="text-xs">{m.modelo_tipo ?? "—"}</TableCell>
                    <TableCell className="text-center tabular-nums">{m.anio ?? "—"}</TableCell>
                    <TableCell className="text-center tabular-nums text-xs">{antig != null ? `${antig}a` : "—"}</TableCell>
                    <TableCell className="text-xs font-mono">{m.serie}</TableCell>
                    <TableCell className="text-xs">{m.vendedor ?? "—"}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={activa ? "default" : "secondary"} className="text-[10px]">
                        {activa ? "Activa" : "Inactiva"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {activa && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Transferir a otro cliente"
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
                              notas: m.notas ?? null,
                            });
                          }}
                        >
                          <ArrowRightLeft className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>
      </div>
      <TransferirMaquinaDialog
        maquina={transferMaquina}
        clienteNombreActual={transferMaquina?.clienteIdActual ? cliById.get(transferMaquina.clienteIdActual)?.nombre ?? "Cliente actual" : "Sin cliente"}
        open={!!transferMaquina}
        onOpenChange={(open) => { if (!open) setTransferMaquina(null); }}
        onTransferred={async () => {
          setTransferMaquina(null);
          await cargar();
        }}
      />
      <NuevaMaquinaDialog
        open={nuevaMaquinaOpen}
        onOpenChange={setNuevaMaquinaOpen}
        onCreated={cargar}
      />
    </div>
  );
}


