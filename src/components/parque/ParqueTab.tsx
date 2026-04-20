import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowDown, ArrowUp, ArrowUpDown, Download, Phone, Search } from "lucide-react";
import { SUCURSALES, MARCAS, type Marca, type Sucursal } from "@/lib/constants";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";

const SUBGRUPOS = [
  "COSECHADORAS",
  "SEMBRADORAS",
  "PICADORAS",
  "PLATAFORMAS",
  "PULVERIZADORAS",
  "TRACTORES",
  "OTRO",
] as const;

const RESULTADOS = [
  "Contactado",
  "No contesta",
  "Rechazó",
  "Agendó servicio",
  "Pendiente llamar",
] as const;

type Cliente = {
  id: string;
  nombre: string;
  sucursal: Sucursal | null;
  activo: boolean;
};
type Contacto = {
  id: string;
  cliente_id: string;
  nombre: string;
  telefono: string | null;
  es_principal: boolean;
  activo: boolean;
};
type Maquina = {
  id: string;
  cliente_id: string | null;
  anio: number | null;
  marca: Marca;
  subgrupo: string;
  activo: boolean;
};
type Factura = {
  cliente_id: string | null;
  fecha: string;
  tipo: "Repuesto" | "Servicio";
  total_venta: number;
};
type Seguimiento = {
  cliente_id: string;
  fecha: string;
  resultado: string;
};

interface Row {
  cliente: Cliente;
  contactoPrincipal: Contacto | null;
  contactosCount: number;
  contactos: Contacto[];
  cantClaas: number;
  cantHorsch: number;
  cantTotal: number;
  subgrupos: string[];
  antiguedadProm: number | null;
  diasUltRepuesto: number | null;
  diasUltServicio: number | null;
  factYTD: number;
  factPrev: number;
  varPct: number | null;
  ultSeg: Seguimiento | null;
}

type SortKey =
  | "cliente"
  | "cantTotal"
  | "antiguedadProm"
  | "diasUltRepuesto"
  | "diasUltServicio"
  | "factYTD"
  | "varPct"
  | "ultSeg";

const dias = (d: string | null | undefined) => {
  if (!d) return null;
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
};

const fmtMoney = (n: number) =>
  new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(n);

const resultadoColor = (r: string | undefined) => {
  switch (r) {
    case "Agendó servicio":
      return "bg-emerald-500 text-white";
    case "Contactado":
      return "bg-blue-500 text-white";
    case "Pendiente llamar":
      return "bg-amber-500 text-white";
    case "No contesta":
      return "bg-muted text-foreground";
    case "Rechazó":
      return "bg-destructive text-destructive-foreground";
    default:
      return "bg-muted text-foreground";
  }
};

export function ParqueTab({ onChanged: _onChanged, onOpenCliente }: { onChanged?: () => void; onOpenCliente?: (id: string) => void }) {
  const [loading, setLoading] = useState(true);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [contactos, setContactos] = useState<Contacto[]>([]);
  const [maquinas, setMaquinas] = useState<Maquina[]>([]);
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [seguimientos, setSeguimientos] = useState<Seguimiento[]>([]);

  // filtros
  const [q, setQ] = useState("");
  const [fSucursal, setFSucursal] = useState<string>("all");
  const [fMarca, setFMarca] = useState<string>("all");
  const [fSubgrupo, setFSubgrupo] = useState<string>("all");
  const [fSeguimiento, setFSeguimiento] = useState<string>("all");

  // orden
  const [sortKey, setSortKey] = useState<SortKey>("cliente");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const cargar = async () => {
    setLoading(true);
    const [c, ct, m, f, s] = await Promise.all([
      supabase.from("clientes").select("id, nombre, sucursal, activo").eq("activo", true),
      supabase
        .from("contactos_cliente")
        .select("id, cliente_id, nombre, telefono, es_principal, activo")
        .eq("activo", true),
      supabase
        .from("parque_maquinas")
        .select("id, cliente_id, anio, marca, subgrupo, activo")
        .eq("activo", true),
      supabase.from("facturacion").select("cliente_id, fecha, tipo, total_venta"),
      supabase
        .from("seguimiento_comercial")
        .select("cliente_id, fecha, resultado")
        .order("fecha", { ascending: false }),
    ]);
    setClientes((c.data ?? []) as Cliente[]);
    setContactos((ct.data ?? []) as Contacto[]);
    setMaquinas((m.data ?? []) as Maquina[]);
    setFacturas(((f.data ?? []) as Factura[]).map((x) => ({ ...x, total_venta: Number(x.total_venta) })));
    setSeguimientos((s.data ?? []) as Seguimiento[]);
    setLoading(false);
  };

  useEffect(() => {
    cargar();
  }, []);

  const rows: Row[] = useMemo(() => {
    const hoy = new Date();
    const inicioAnio = new Date(hoy.getFullYear(), 0, 1);
    const inicioAnioPrev = new Date(hoy.getFullYear() - 1, 0, 1);
    const finAnioPrev = new Date(hoy.getFullYear(), 0, 1);

    // indexar
    const contactosByCliente = new Map<string, Contacto[]>();
    for (const ct of contactos) {
      const arr = contactosByCliente.get(ct.cliente_id) ?? [];
      arr.push(ct);
      contactosByCliente.set(ct.cliente_id, arr);
    }
    const maquinasByCliente = new Map<string, Maquina[]>();
    for (const mq of maquinas) {
      if (!mq.cliente_id) continue;
      const arr = maquinasByCliente.get(mq.cliente_id) ?? [];
      arr.push(mq);
      maquinasByCliente.set(mq.cliente_id, arr);
    }

    const ultRepByCliente = new Map<string, string>();
    const ultSrvByCliente = new Map<string, string>();
    const factYTDByCliente = new Map<string, number>();
    const factPrevByCliente = new Map<string, number>();
    for (const fc of facturas) {
      if (!fc.cliente_id) continue;
      const fd = new Date(fc.fecha);
      if (fc.tipo === "Repuesto") {
        const cur = ultRepByCliente.get(fc.cliente_id);
        if (!cur || new Date(cur) < fd) ultRepByCliente.set(fc.cliente_id, fc.fecha);
      } else {
        const cur = ultSrvByCliente.get(fc.cliente_id);
        if (!cur || new Date(cur) < fd) ultSrvByCliente.set(fc.cliente_id, fc.fecha);
      }
      if (fd >= inicioAnio) {
        factYTDByCliente.set(fc.cliente_id, (factYTDByCliente.get(fc.cliente_id) ?? 0) + fc.total_venta);
      } else if (fd >= inicioAnioPrev && fd < finAnioPrev) {
        factPrevByCliente.set(fc.cliente_id, (factPrevByCliente.get(fc.cliente_id) ?? 0) + fc.total_venta);
      }
    }

    const ultSegByCliente = new Map<string, Seguimiento>();
    for (const sg of seguimientos) {
      const cur = ultSegByCliente.get(sg.cliente_id);
      if (!cur || new Date(cur.fecha) < new Date(sg.fecha)) ultSegByCliente.set(sg.cliente_id, sg);
    }

    return clientes.map((cli) => {
      const cts = contactosByCliente.get(cli.id) ?? [];
      const principal =
        cts.find((x) => x.es_principal) ?? cts[0] ?? null;
      const mqs = maquinasByCliente.get(cli.id) ?? [];
      const cantClaas = mqs.filter((m) => m.marca === "CLAAS").length;
      const cantHorsch = mqs.filter((m) => m.marca === "HORSCH").length;
      const subgs = Array.from(new Set(mqs.map((m) => m.subgrupo))).sort();
      const anios = mqs.map((m) => m.anio).filter((a): a is number => !!a);
      const antiguedadProm =
        anios.length > 0
          ? Math.round((anios.reduce((s, a) => s + (hoy.getFullYear() - a), 0) / anios.length) * 10) / 10
          : null;
      const ytd = factYTDByCliente.get(cli.id) ?? 0;
      const prev = factPrevByCliente.get(cli.id) ?? 0;
      const varPct = prev > 0 ? Math.round(((ytd - prev) / prev) * 100) : ytd > 0 ? 100 : null;

      return {
        cliente: cli,
        contactoPrincipal: principal,
        contactosCount: cts.length,
        contactos: cts,
        cantClaas,
        cantHorsch,
        cantTotal: mqs.length,
        subgrupos: subgs,
        antiguedadProm,
        diasUltRepuesto: dias(ultRepByCliente.get(cli.id) ?? null),
        diasUltServicio: dias(ultSrvByCliente.get(cli.id) ?? null),
        factYTD: ytd,
        factPrev: prev,
        varPct,
        ultSeg: ultSegByCliente.get(cli.id) ?? null,
      };
    });
  }, [clientes, contactos, maquinas, facturas, seguimientos]);

  const filtradas = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (ql && !r.cliente.nombre.toLowerCase().includes(ql)) return false;
      if (fSucursal !== "all" && r.cliente.sucursal !== fSucursal) return false;
      if (fMarca !== "all") {
        if (fMarca === "CLAAS" && r.cantClaas === 0) return false;
        if (fMarca === "HORSCH" && r.cantHorsch === 0) return false;
      }
      if (fSubgrupo !== "all" && !r.subgrupos.includes(fSubgrupo)) return false;
      if (fSeguimiento !== "all") {
        if (fSeguimiento === "sin_seguimiento" && r.ultSeg) return false;
        if (fSeguimiento !== "sin_seguimiento" && r.ultSeg?.resultado !== fSeguimiento) return false;
      }
      return true;
    });
  }, [rows, q, fSucursal, fMarca, fSubgrupo, fSeguimiento]);

  const ordenadas = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const safe = (n: number | null | undefined) => (n == null ? Number.POSITIVE_INFINITY : n);
    return [...filtradas].sort((a, b) => {
      switch (sortKey) {
        case "cliente":
          return a.cliente.nombre.localeCompare(b.cliente.nombre) * dir;
        case "cantTotal":
          return (a.cantTotal - b.cantTotal) * dir;
        case "antiguedadProm":
          return (safe(a.antiguedadProm) - safe(b.antiguedadProm)) * dir;
        case "diasUltRepuesto":
          return (safe(a.diasUltRepuesto) - safe(b.diasUltRepuesto)) * dir;
        case "diasUltServicio":
          return (safe(a.diasUltServicio) - safe(b.diasUltServicio)) * dir;
        case "factYTD":
          return (a.factYTD - b.factYTD) * dir;
        case "varPct":
          return (safe(a.varPct) - safe(b.varPct)) * dir;
        case "ultSeg":
          return (
            ((a.ultSeg ? new Date(a.ultSeg.fecha).getTime() : 0) -
              (b.ultSeg ? new Date(b.ultSeg.fecha).getTime() : 0)) *
            dir
          );
      }
    });
  }, [filtradas, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(k);
      setSortDir("asc");
    }
  };

  const sortIcon = (k: SortKey) => {
    if (sortKey !== k) return <ArrowUpDown className="h-3 w-3 opacity-50" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };

  const exportar = () => {
    const data = ordenadas.map((r) => ({
      Cliente: r.cliente.nombre,
      Sucursal: r.cliente.sucursal ?? "",
      "Contacto principal": r.contactoPrincipal?.nombre ?? "",
      Teléfono: r.contactoPrincipal?.telefono ?? "",
      "Cant. contactos": r.contactosCount,
      "Máq. CLAAS": r.cantClaas,
      "Máq. HORSCH": r.cantHorsch,
      "Total máq.": r.cantTotal,
      Subgrupos: r.subgrupos.join(", "),
      "Antig. prom (años)": r.antiguedadProm ?? "",
      "Días últ. repuesto": r.diasUltRepuesto ?? "",
      "Días últ. servicio": r.diasUltServicio ?? "",
      "Fact. YTD": r.factYTD,
      "Var % vs año ant.": r.varPct ?? "",
      "Últ. seguimiento": r.ultSeg ? new Date(r.ultSeg.fecha).toLocaleDateString("es-PY") : "",
      "Resultado seguimiento": r.ultSeg?.resultado ?? "",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Parque");
    XLSX.writeFile(wb, `parque-clientes-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const filaColor = (diasServ: number | null) => {
    if (diasServ == null) return "bg-destructive/10 hover:bg-destructive/15";
    if (diasServ > 365) return "bg-destructive/10 hover:bg-destructive/15";
    if (diasServ > 180) return "bg-amber-500/10 hover:bg-amber-500/15";
    return "hover:bg-accent/40";
  };

  return (
    <div className="space-y-3">
      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar cliente..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select value={fSucursal} onValueChange={setFSucursal}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder="Sucursal" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las sucursales</SelectItem>
            {SUCURSALES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={fMarca} onValueChange={setFMarca}>
          <SelectTrigger className="w-[120px]"><SelectValue placeholder="Marca" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las marcas</SelectItem>
            {MARCAS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={fSubgrupo} onValueChange={setFSubgrupo}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Subgrupo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los subgrupos</SelectItem>
            {SUBGRUPOS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={fSeguimiento} onValueChange={setFSeguimiento}>
          <SelectTrigger className="w-[170px]"><SelectValue placeholder="Seguimiento" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Cualquier seguimiento</SelectItem>
            <SelectItem value="sin_seguimiento">Sin seguimiento</SelectItem>
            {RESULTADOS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={exportar} className="ml-auto">
          <Download className="mr-1 h-4 w-4" /> Exportar Excel
        </Button>
      </div>

      <div className="text-xs text-muted-foreground">
        {ordenadas.length} cliente{ordenadas.length === 1 ? "" : "s"}
      </div>

      {/* Tabla */}
      <div className="rounded-md border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="cursor-pointer whitespace-nowrap" onClick={() => toggleSort("cliente")}>
                <div className="flex items-center gap-1">Cliente {sortIcon("cliente")}</div>
              </TableHead>
              <TableHead className="whitespace-nowrap">Contacto</TableHead>
              <TableHead className="cursor-pointer whitespace-nowrap" onClick={() => toggleSort("cantTotal")}>
                <div className="flex items-center gap-1">Máquinas {sortIcon("cantTotal")}</div>
              </TableHead>
              <TableHead className="whitespace-nowrap">Subgrupos</TableHead>
              <TableHead className="cursor-pointer whitespace-nowrap text-right" onClick={() => toggleSort("antiguedadProm")}>
                <div className="flex items-center justify-end gap-1">Antig. {sortIcon("antiguedadProm")}</div>
              </TableHead>
              <TableHead className="cursor-pointer whitespace-nowrap text-right" onClick={() => toggleSort("diasUltRepuesto")}>
                <div className="flex items-center justify-end gap-1">Últ. Rep. {sortIcon("diasUltRepuesto")}</div>
              </TableHead>
              <TableHead className="cursor-pointer whitespace-nowrap text-right" onClick={() => toggleSort("diasUltServicio")}>
                <div className="flex items-center justify-end gap-1">Últ. Serv. {sortIcon("diasUltServicio")}</div>
              </TableHead>
              <TableHead className="cursor-pointer whitespace-nowrap text-right" onClick={() => toggleSort("factYTD")}>
                <div className="flex items-center justify-end gap-1">Fact. YTD {sortIcon("factYTD")}</div>
              </TableHead>
              <TableHead className="cursor-pointer whitespace-nowrap text-right" onClick={() => toggleSort("varPct")}>
                <div className="flex items-center justify-end gap-1">%VAR {sortIcon("varPct")}</div>
              </TableHead>
              <TableHead className="cursor-pointer whitespace-nowrap" onClick={() => toggleSort("ultSeg")}>
                <div className="flex items-center gap-1">Últ. Seguimiento {sortIcon("ultSeg")}</div>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={10} className="h-20 text-center text-muted-foreground">
                  Cargando...
                </TableCell>
              </TableRow>
            )}
            {!loading && ordenadas.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="h-20 text-center text-muted-foreground">
                  Sin clientes que coincidan con los filtros.
                </TableCell>
              </TableRow>
            )}
            {!loading &&
              ordenadas.map((r) => (
                <TableRow key={r.cliente.id} className={cn(filaColor(r.diasUltServicio))}>
                  <TableCell>
                    <div className="font-medium">{r.cliente.nombre}</div>
                    {r.cliente.sucursal && (
                      <div className="text-[11px] text-muted-foreground">{r.cliente.sucursal}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    {r.contactoPrincipal ? (
                      <div className="flex items-center gap-1.5">
                        <div className="min-w-0">
                          <div className="truncate text-sm">{r.contactoPrincipal.nombre}</div>
                          {r.contactoPrincipal.telefono && (
                            <a
                              href={`tel:${r.contactoPrincipal.telefono}`}
                              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary"
                            >
                              <Phone className="h-3 w-3" /> {r.contactoPrincipal.telefono}
                            </a>
                          )}
                        </div>
                        {r.contactosCount > 1 && (
                          <Badge variant="secondary" className="ml-auto text-[10px]">
                            +{r.contactosCount - 1}
                          </Badge>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1">
                      {r.cantClaas > 0 && (
                        <Badge className="bg-emerald-600 text-white hover:bg-emerald-600/90">
                          CLAAS {r.cantClaas}
                        </Badge>
                      )}
                      {r.cantHorsch > 0 && (
                        <Badge className="bg-orange-500 text-white hover:bg-orange-500/90">
                          HORSCH {r.cantHorsch}
                        </Badge>
                      )}
                      {r.cantTotal === 0 && <span className="text-xs text-muted-foreground">—</span>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {r.subgrupos.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                      {r.subgrupos.map((s) => (
                        <Badge key={s} variant="outline" className="text-[10px]">
                          {s.slice(0, 4)}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.antiguedadProm ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.diasUltRepuesto != null ? `${r.diasUltRepuesto}d` : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.diasUltServicio != null ? `${r.diasUltServicio}d` : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.factYTD > 0 ? fmtMoney(r.factYTD) : "—"}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right tabular-nums font-medium",
                      r.varPct != null && r.varPct >= 0 && "text-emerald-600",
                      r.varPct != null && r.varPct < 0 && "text-destructive",
                    )}
                  >
                    {r.varPct != null ? `${r.varPct > 0 ? "+" : ""}${r.varPct}%` : "—"}
                  </TableCell>
                  <TableCell>
                    {r.ultSeg ? (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[11px] text-muted-foreground">
                          {new Date(r.ultSeg.fecha).toLocaleDateString("es-PY")}
                        </span>
                        <Badge className={cn("w-fit text-[10px]", resultadoColor(r.ultSeg.resultado))}>
                          {r.ultSeg.resultado}
                        </Badge>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
