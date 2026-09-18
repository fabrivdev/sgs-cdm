import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CompactListInfo, CompactListTable, type CompactListColumn } from "@/components/lists/CompactListTable";
import { useSectionTable } from "@/components/exports/useSectionTable";
import { SectionActionsMenu } from "@/components/exports/SectionActionsMenu";
import type { SalesColumn } from "@/components/ventas/salesTableInteraction";
import { SUCURSALES, type Sucursal } from "@/lib/constants";
import { trabajoReferencia } from "@/lib/trabajos";
import { FiltersBar, FilterDate } from "@/components/filters/FiltersBar";
import { FilterMultiSelect, matchesMulti } from "@/components/filters/FilterMultiSelect";
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

const fmtMoney = (n: number | null | undefined) => n == null ? "—" : "$ " + new Intl.NumberFormat("es-PY", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const fmtNum = (n: number | null | undefined) => n == null ? "—" : new Intl.NumberFormat("es-PY", { maximumFractionDigits: 2 }).format(n);
const fmtDate = (s: string | null | undefined) => {
  if (!s) return "—";
  try { return format(parseISO(s), "dd/MM/yyyy"); } catch { return s; }
};


function Metric({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("tabular-nums font-semibold", highlight ? "text-[14px] text-primary" : "text-[13px]")}>{value}</div>
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
  const [loadError, setLoadError] = useState(false);
  const [detalleId, setDetalleId] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [fSucursales, setFSucursales] = useState<string[]>([]);
  const [fSitOs, setFSitOs] = useState<string[]>([]);
  const [fSitFac, setFSitFac] = useState<string[]>([]);
  const [fDesde, setFDesde] = useState("");
  const [fHasta, setFHasta] = useState("");

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
      setLoadError(false);
    } catch (e: any) {
      setLoadError(true);
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
      if (!matchesMulti(fSucursales, t?.sucursal)) return false;
      if (!matchesMulti(fSitOs, o.situacion_os)) return false;
      if (!matchesMulti(fSitFac, o.situacion_facturacion)) return false;
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
  }, [os, q, fSucursales, fSitOs, fSitFac, fDesde, fHasta, trabajoMap, clienteMap]);

  const columns: SalesColumn<OSRow>[] = [
    { key: "os", label: "OS", kind: "text", value: o => o.os_numero },
    { key: "tr", label: "TR", kind: "text", value: o => o.trabajo_id ? trabajoMap.get(o.trabajo_id)?.codigo : null },
    { key: "cliente", label: "Cliente", kind: "text", value: o => { const t = o.trabajo_id ? trabajoMap.get(o.trabajo_id) : null; return t?.cliente_id ? clienteMap.get(t.cliente_id)?.nombre : o.cliente_nombre; } },
    { key: "fecha", label: "Fecha OS", kind: "date", value: o => o.fecha_abierta_os?.slice(0, 10) },
    { key: "horas", label: "Horas", kind: "number", align: "center", value: o => o.servicios_cantidad },
    { key: "servicios", label: "Servicios", kind: "number", align: "right", value: o => o.servicios_valor },
    { key: "repuestos", label: "Repuestos", kind: "number", align: "right", value: o => o.repuesto_valor },
    { key: "km", label: "Km + Terc.", kind: "number", align: "right", value: o => (o.kilometro_valor ?? 0) + (o.terceros_valor ?? 0) },
    { key: "total", label: "Total", kind: "number", align: "right", value: totalOf },
    { key: "situacion", label: "Situación", kind: "text", value: o => [o.situacion_os, o.situacion_facturacion].filter(Boolean).join(" · ") },
    { key: "factura", label: "Factura", kind: "text", value: o => o.factura },
    { key: "chasis", label: "Chasis", kind: "text", value: o => o.nro_chasis },
    { key: "tecnico", label: "Técnico", kind: "text", value: o => o.responsable ?? o.cod_mecanico },
  ];
  const table = useSectionTable({ rows: filtered, columns, title: "OS vinculadas", fileName: "trabajos-os.xlsx", initialSort: { key: "fecha", direction: "desc" }, disabled: loading || loadError });
  const sorted = table.ordered;

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
    setQ(""); setFSucursales([]); setFSitOs([]); setFSitFac([]); setFDesde(""); setFHasta("");
  };

  const activosCount =
    (q ? 1 : 0) +
    (fSucursales.length ? 1 : 0) +
    (fSitOs.length ? 1 : 0) +
    (fSitFac.length ? 1 : 0) +
    (fDesde ? 1 : 0) +
    (fHasta ? 1 : 0);

  return (
    <div className="flex flex-col gap-3">
      <FiltersBar
        secondaryActions={<SectionActionsMenu options={table.action ? [table.action] : []} />}
        search={{ value: q, onChange: setQ, placeholder: "Buscar OS, factura, cliente, chasis, mecánico…" }}
        activeCount={activosCount}
        onClear={limpiar}
        meta={`${filtered.length} OS · Total ${fmtMoney(totales.total)} · ${fmtNum(totales.horas)} h`}
      >
        <FilterMultiSelect
          label="Sucursal" values={fSucursales} onChange={setFSucursales} placeholder="Todas" width="w-[150px]"
          options={SUCURSALES.map(s => ({ value: s, label: s }))}
        />
        <FilterMultiSelect
          label="Sit. OS" values={fSitOs} onChange={setFSitOs} placeholder="Todas" width="w-[150px]"
          options={sitOsOpts.map(s => ({ value: s, label: s }))}
        />
        <FilterMultiSelect
          label="Sit. Fact." values={fSitFac} onChange={setFSitFac} placeholder="Todas" width="w-[150px]"
          options={sitFacOpts.map(s => ({ value: s, label: s }))}
        />
        <FilterDate label="Desde" value={fDesde} onChange={setFDesde} title="Fecha apertura OS desde" />
        <FilterDate label="Hasta" value={fHasta} onChange={setFHasta} title="Fecha apertura OS hasta" />
      </FiltersBar>

      {loading ? (
        <Card className="p-8 text-center text-muted-foreground">Cargando…</Card>
      ) : loadError ? (
        <Card role="alert" className="p-8 text-center text-destructive">No se pudieron cargar las OS. <Button variant="outline" size="sm" onClick={load}>Reintentar</Button></Card>
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

          <Card className="overflow-hidden">
            <CompactListTable rows={sorted} columns={columns.slice(0,10).map(column=>{
              const layout:Record<string,Pick<CompactListColumn<OSRow>,"width"|"hiddenBelow">>={
                os:{width:"w-[28%] md:w-[16%] xl:w-[10%]"},
                tr:{width:"md:w-[10%] xl:w-[7%]",hiddenBelow:"md"},
                cliente:{width:"w-[42%] md:w-[28%] xl:w-[20%]"},
                fecha:{width:"md:w-[14%] xl:w-[9%]",hiddenBelow:"md"},
                horas:{width:"md:w-[8%] xl:w-[6%]",hiddenBelow:"md"},
                servicios:{width:"xl:w-[10%]",hiddenBelow:"xl"},
                repuestos:{width:"xl:w-[10%]",hiddenBelow:"xl"},
                km:{width:"xl:w-[10%]",hiddenBelow:"xl"},
                total:{width:"w-[30%] md:w-[24%] xl:w-[10%]"},
                situacion:{width:"xl:w-[8%]",hiddenBelow:"xl"},
              };
              return {...column,...layout[column.key],title:(o:OSRow)=>String(column.value(o)??"—"),render:(o:OSRow)=>{
                if(column.key==="os")return <CompactListInfo label={o.os_numero} fields={[
                  ...columns.map(c=>[c.label,String(c.value(o)??"—")] as const),
                  ["Fecha factura",fmtDate(o.fecha_emision_factura)],["Problema",o.problema||"—"],
                  ["Km OS",fmtNum(o.km_cantidad)],["Tiempo",o.tipo_tiempo||"—"],
                ]}>{o.trabajo_id&&trabajoMap.has(o.trabajo_id)&&<Button variant="outline" size="sm" onClick={()=>setDetalleId(o.trabajo_id)}>Ver trabajo</Button>}</CompactListInfo>;
                if(column.key==="fecha")return fmtDate(o.fecha_abierta_os);
                if(column.key==="horas")return fmtNum(o.servicios_cantidad);
                if(column.kind==="number"){const value=column.value(o);return fmtMoney(value==null?null:Number(value));}
                return String(column.value(o)??"—");
              }};
            })} id={o=>`${o.os_numero}-${o.trabajo_id}`} label="OS vinculadas" sort={table.sort} heading={table.heading}
              onSelect={o=>{if(o.trabajo_id&&trabajoMap.has(o.trabajo_id))setDetalleId(o.trabajo_id);}} />
          </Card>
        </>
      )}


      <TrabajoDetalleDrawer
        trabajoId={detalleId}
        onOpenChange={(o) => !o && setDetalleId(null)}
        clientes={clientes}
        profileMap={profileMap}
        clienteMap={clienteMap}
        onChanged={() => { load(); onChanged?.(); }}
      />
    </div>
  );
}


