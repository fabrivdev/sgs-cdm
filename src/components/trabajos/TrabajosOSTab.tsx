import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowUpDown } from "lucide-react";
import { SUCURSALES, type Sucursal } from "@/lib/constants";
import { trabajoReferencia } from "@/lib/trabajos";
import { FiltersBar, FilterSelect, FilterDate } from "@/components/filters/FiltersBar";
import { TrabajoDetalleDrawer } from "@/components/trabajos/TrabajoDetalleDrawer";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const PAGE = 1000;
async function cargarTodo<T>(qb: any): Promise<T[]> {
  let from = 0;
  const all: T[] = [];
  while (true) {
    const { data, error } = await qb.range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...(data as T[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

interface OSRow {
  os_numero: string;
  trabajo_id: string | null;
  cliente_nombre: string | null;
  fecha_abierta_os: string | null;
  fecha_emision_factura: string | null;
  factura: string | null;
  marca: string | null;
  nro_chasis: string | null;
  responsable: string | null;
  cod_mecanico: string | null;
  problema: string | null;
  tipo_tiempo: string | null;
  servicios_cantidad: number | null;
  servicios_valor_unitario: number | null;
  servicios_valor: number | null;
  repuesto_valor: number | null;
  km_cantidad: number | null;
  km_valor_unitario: number | null;
  kilometro_valor: number | null;
  terceros_valor: number | null;
  situacion_os: string | null;
  situacion_facturacion: string | null;
}

interface TrabajoLite {
  id: string;
  codigo: string | null;
  os_numero: string | null;
  sucursal: Sucursal;
  cliente_id: string | null;
  descripcion_problema: string;
}

interface Cliente { id: string; nombre: string; sucursal: Sucursal | null }
interface Profile { id: string; nombre: string; sucursal: Sucursal | null }

const fmtMoney = (n: number | null | undefined) => n == null ? "—" : "$" + new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const fmtNum = (n: number | null | undefined) => n == null ? "—" : new Intl.NumberFormat("es-PY", { maximumFractionDigits: 2 }).format(n);
const fmtDate = (s: string | null | undefined) => {
  if (!s) return "—";
  try { return format(parseISO(s), "dd/MM/yyyy"); } catch { return s; }
};

type SortKey = "fecha" | "total" | "horas" | "os";

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("tabular-nums font-semibold", highlight ? "text-base text-primary" : "text-sm")}>{value}</div>
    </div>
  );
}


export function TrabajosOSTab({
  clientes,
  profiles,
  onChanged,
}: {
  clientes: Cliente[];
  profiles: Profile[];
  onChanged?: () => void;
}) {
  const [os, setOs] = useState<OSRow[]>([]);
  const [trabajos, setTrabajos] = useState<TrabajoLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [detalleId, setDetalleId] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [fSucursal, setFSucursal] = useState("all");
  const [fSitOs, setFSitOs] = useState("all");
  const [fSitFac, setFSitFac] = useState("all");
  const [fDesde, setFDesde] = useState("");
  const [fHasta, setFHasta] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("fecha");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const load = async () => {
    setLoading(true);
    try {
      const [osRows, tRows] = await Promise.all([
        cargarTodo<OSRow>(
          (supabase.from("ordenes_servicio_importadas" as any)
            .select("os_numero, trabajo_id, cliente_nombre, fecha_abierta_os, fecha_emision_factura, factura, marca, nro_chasis, responsable, cod_mecanico, problema, tipo_tiempo, servicios_cantidad, servicios_valor_unitario, servicios_valor, repuesto_valor, km_cantidad, km_valor_unitario, kilometro_valor, terceros_valor, situacion_os, situacion_facturacion")
            .not("trabajo_id", "is", null)
            .order("fecha_abierta_os", { ascending: false }) as any),
        ),
        cargarTodo<TrabajoLite>(
          supabase.from("trabajos").select("id, codigo, os_numero, sucursal, cliente_id, descripcion_problema"),
        ),
      ]);
      setOs(osRows);
      setTrabajos(tRows);
    } catch (e: any) {
      toast.error(e?.message ?? "Error cargando OS");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const trabajoMap = useMemo(() => new Map(trabajos.map(t => [t.id, t])), [trabajos]);
  const clienteMap = useMemo(() => new Map(clientes.map(c => [c.id, c])), [clientes]);
  const profileMap = useMemo(() => new Map(profiles.map(p => [p.id, p])), [profiles]);

  const sitOsOpts = useMemo(() => {
    const s = new Set<string>();
    os.forEach(o => { if (o.situacion_os) s.add(o.situacion_os); });
    return Array.from(s).sort();
  }, [os]);
  const sitFacOpts = useMemo(() => {
    const s = new Set<string>();
    os.forEach(o => { if (o.situacion_facturacion) s.add(o.situacion_facturacion); });
    return Array.from(s).sort();
  }, [os]);

  const totalOf = (o: OSRow) =>
    (o.servicios_valor ?? 0) + (o.repuesto_valor ?? 0) + (o.kilometro_valor ?? 0) + (o.terceros_valor ?? 0);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return os.filter(o => {
      const t = o.trabajo_id ? trabajoMap.get(o.trabajo_id) : null;
      if (fSucursal !== "all" && t?.sucursal !== fSucursal) return false;
      if (fSitOs !== "all" && o.situacion_os !== fSitOs) return false;
      if (fSitFac !== "all" && o.situacion_facturacion !== fSitFac) return false;
      if (fDesde && (!o.fecha_abierta_os || o.fecha_abierta_os < fDesde)) return false;
      if (fHasta && (!o.fecha_abierta_os || o.fecha_abierta_os > fHasta + "T23:59:59")) return false;
      if (query) {
        const cli = t?.cliente_id ? clienteMap.get(t.cliente_id)?.nombre ?? "" : (o.cliente_nombre ?? "");
        const ref = t ? trabajoReferencia(t) : "";
        const hay = [
          o.os_numero, o.factura, o.nro_chasis, o.responsable, o.cod_mecanico,
          o.problema, cli, ref, t?.codigo ?? "",
        ].join(" ").toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });
  }, [os, q, fSucursal, fSitOs, fSitFac, fDesde, fHasta, trabajoMap, clienteMap]);

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      let av: number | string = 0, bv: number | string = 0;
      switch (sortKey) {
        case "fecha": av = a.fecha_abierta_os ?? ""; bv = b.fecha_abierta_os ?? ""; break;
        case "total": av = totalOf(a); bv = totalOf(b); break;
        case "horas": av = a.servicios_cantidad ?? 0; bv = b.servicios_cantidad ?? 0; break;
        case "os": av = a.os_numero; bv = b.os_numero; break;
      }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [filtered, sortKey, sortDir]);

  const totales = useMemo(() => {
    let horas = 0, serv = 0, rep = 0, km = 0, terc = 0, total = 0;
    for (const o of filtered) {
      horas += o.servicios_cantidad ?? 0;
      serv += o.servicios_valor ?? 0;
      rep += o.repuesto_valor ?? 0;
      km += o.kilometro_valor ?? 0;
      terc += o.terceros_valor ?? 0;
      total += totalOf(o);
    }
    return { horas, serv, rep, km, terc, total };
  }, [filtered]);

  const limpiar = () => {
    setQ(""); setFSucursal("all"); setFSitOs("all"); setFSitFac("all"); setFDesde(""); setFHasta("");
  };

  const activosCount =
    (q ? 1 : 0) +
    (fSucursal !== "all" ? 1 : 0) +
    (fSitOs !== "all" ? 1 : 0) +
    (fSitFac !== "all" ? 1 : 0) +
    (fDesde ? 1 : 0) +
    (fHasta ? 1 : 0);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("desc"); }
  };

  const SortHeader = ({ k, children, className }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <th className={cn("px-2 py-1.5 text-left font-medium whitespace-nowrap", className)}>
      <button onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 hover:text-foreground">
        {children}
        <ArrowUpDown className={cn("h-3 w-3", sortKey === k ? "opacity-100" : "opacity-30")} />
      </button>
    </th>
  );

  return (
    <div className="flex flex-col gap-3">
      <FiltersBar
        search={{ value: q, onChange: setQ, placeholder: "Buscar OS, factura, cliente, chasis, mecánico…" }}
        activeCount={activosCount}
        onClear={limpiar}
        meta={`${filtered.length} OS · Total ${fmtMoney(totales.total)} · ${fmtNum(totales.horas)} h`}
      >
        <FilterSelect
          label="Sucursal" value={fSucursal} onChange={setFSucursal} placeholder="Sucursal" width="w-[150px]"
          options={[{ value: "all", label: "Todas" }, ...SUCURSALES.map(s => ({ value: s, label: s }))]}
        />
        <FilterSelect
          label="Sit. OS" value={fSitOs} onChange={setFSitOs} placeholder="Situación OS" width="w-[150px]"
          options={[{ value: "all", label: "Todas" }, ...sitOsOpts.map(s => ({ value: s, label: s }))]}
        />
        <FilterSelect
          label="Sit. Fact." value={fSitFac} onChange={setFSitFac} placeholder="Sit. Fact." width="w-[150px]"
          options={[{ value: "all", label: "Todas" }, ...sitFacOpts.map(s => ({ value: s, label: s }))]}
        />
        <FilterDate label="Desde" value={fDesde} onChange={setFDesde} title="Fecha apertura OS desde" />
        <FilterDate label="Hasta" value={fHasta} onChange={setFHasta} title="Fecha apertura OS hasta" />
      </FiltersBar>

      {loading ? (
        <Card className="p-8 text-center text-muted-foreground">Cargando…</Card>
      ) : sorted.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">No hay OS vinculadas con los filtros seleccionados.</Card>
      ) : (
        <>
          <Card className="p-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Metric label="OS" value={filtered.length.toString()} />
              <Metric label="Horas" value={fmtNum(totales.horas)} />
              <Metric label="Servicios" value={fmtMoney(totales.serv)} />
              <Metric label="Repuestos" value={fmtMoney(totales.rep)} />
              <Metric label="Km + Terc." value={fmtMoney(totales.km + totales.terc)} />
              <Metric label="Total" value={fmtMoney(totales.total)} highlight />
            </div>
          </Card>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {sorted.map(o => {
              const t = o.trabajo_id ? trabajoMap.get(o.trabajo_id) : null;
              const cli = t?.cliente_id ? clienteMap.get(t.cliente_id)?.nombre : o.cliente_nombre;
              const total = totalOf(o);
              return (
                <Card
                  key={`${o.os_numero}-${o.trabajo_id}`}
                  onClick={() => t && setDetalleId(t.id)}
                  className={cn(
                    "p-3 transition-all hover:shadow-md hover:border-primary/40",
                    t && "cursor-pointer",
                  )}
                >
                  {/* Header */}
                  <div className="flex flex-wrap items-start justify-between gap-2 border-b pb-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-mono font-bold text-primary tabular-nums">
                          OS-{o.os_numero}
                        </span>
                        {t && (
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground tabular-nums">
                            {trabajoReferencia(t)}
                          </span>
                        )}
                        {o.marca && (
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{o.marca}</span>
                        )}
                      </div>
                      <div className="mt-1 truncate text-sm font-semibold" title={cli ?? ""}>
                        {cli ?? "—"}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-base font-bold tabular-nums">{fmtMoney(total)}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {fmtNum(o.servicios_cantidad)} h · {fmtDate(o.fecha_abierta_os)}
                      </div>
                    </div>
                  </div>

                  {/* Breakdown */}
                  <div className="mt-2 grid grid-cols-4 gap-2 text-xs">
                    <Cell label="Servicios" value={fmtMoney(o.servicios_valor)} sub={o.servicios_cantidad != null ? `${fmtNum(o.servicios_cantidad)} h × ${fmtMoney(o.servicios_valor_unitario)}` : null} />
                    <Cell label="Repuestos" value={fmtMoney(o.repuesto_valor)} />
                    <Cell label="Kilometraje" value={fmtMoney(o.kilometro_valor)} sub={o.km_cantidad != null ? `${fmtNum(o.km_cantidad)} × ${fmtMoney(o.km_valor_unitario)}` : null} />
                    <Cell label="Terceros" value={fmtMoney(o.terceros_valor)} />
                  </div>

                  {/* Meta */}
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    {o.factura && <span><span className="text-muted-foreground/60">Fact.</span> {o.factura} · {fmtDate(o.fecha_emision_factura)}</span>}
                    {(o.responsable || o.cod_mecanico) && <span><span className="text-muted-foreground/60">Mec.</span> {o.responsable ?? o.cod_mecanico}</span>}
                    {o.nro_chasis && <span className="font-mono"><span className="text-muted-foreground/60 font-sans">Chasis</span> {o.nro_chasis}</span>}
                    {o.tipo_tiempo && <span>{o.tipo_tiempo}</span>}
                  </div>

                  {o.problema && (
                    <div className="mt-1.5 line-clamp-2 text-xs text-foreground/80" title={o.problema}>
                      {o.problema}
                    </div>
                  )}

                  {(o.situacion_os || o.situacion_facturacion) && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {o.situacion_os && <Badge variant="outline" className="text-[10px]">OS: {o.situacion_os}</Badge>}
                      {o.situacion_facturacion && <Badge variant="outline" className="text-[10px]">Fact: {o.situacion_facturacion}</Badge>}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </>
      )}


      <TrabajoDetalleDrawer
        trabajoId={detalleId}
        onOpenChange={(o) => !o && setDetalleId(null)}
        clientes={clientes}
        tecnicos={profiles}
        profileMap={profileMap}
        clienteMap={clienteMap}
        onChanged={() => { load(); onChanged?.(); }}
      />
    </div>
  );
}
