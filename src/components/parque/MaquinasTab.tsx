import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowDown, ArrowUp, ArrowUpDown, Download, Search } from "lucide-react";
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
  activo: boolean;
};

type Cliente = { id: string; nombre: string; sucursal: Sucursal | null };

type SortKey = "cliente" | "marca" | "subgrupo" | "anio" | "serie" | "sucursal";

export function MaquinasTab({ onOpenCliente }: { onOpenCliente?: (id: string) => void }) {
  const [loading, setLoading] = useState(true);
  const [maquinas, setMaquinas] = useState<Maquina[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);

  const [q, setQ] = useState("");
  const [fSucursal, setFSucursal] = useState("all");
  const [fMarca, setFMarca] = useState("all");
  const [fSubgrupo, setFSubgrupo] = useState("all");
  const [fEstado, setFEstado] = useState("activa");
  const [anioDesde, setAnioDesde] = useState("");
  const [anioHasta, setAnioHasta] = useState("");

  const [sortKey, setSortKey] = useState<SortKey>("cliente");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [m, c] = await Promise.all([
        supabase
          .from("parque_maquinas")
          .select("id, cliente_id, anio, marca, subgrupo, modelo_tipo, serie, vendedor, sucursal, localidad, activo"),
        supabase.from("clientes").select("id, nombre, sucursal"),
      ]);
      setMaquinas((m.data ?? []) as Maquina[]);
      setClientes((c.data ?? []) as Cliente[]);
      setLoading(false);
    })();
  }, []);

  const cliById = useMemo(() => {
    const map = new Map<string, Cliente>();
    for (const c of clientes) map.set(c.id, c);
    return map;
  }, [clientes]);

  const filtradas = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const ad = anioDesde ? Number(anioDesde) : null;
    const ah = anioHasta ? Number(anioHasta) : null;
    return maquinas.filter((m) => {
      if (fEstado === "activa" && !m.activo) return false;
      if (fEstado === "inactiva" && m.activo) return false;
      if (fSucursal !== "all" && m.sucursal !== fSucursal) return false;
      if (fMarca !== "all" && m.marca !== fMarca) return false;
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
  }, [maquinas, cliById, q, fSucursal, fMarca, fSubgrupo, fEstado, anioDesde, anioHasta]);

  const ordenadas = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtradas].sort((a, b) => {
      const cliA = a.cliente_id ? cliById.get(a.cliente_id)?.nombre ?? "" : "";
      const cliB = b.cliente_id ? cliById.get(b.cliente_id)?.nombre ?? "" : "";
      switch (sortKey) {
        case "cliente": return cliA.localeCompare(cliB) * dir;
        case "marca": return a.marca.localeCompare(b.marca) * dir;
        case "subgrupo": return (a.subgrupo ?? "").localeCompare(b.subgrupo ?? "") * dir;
        case "anio": return ((a.anio ?? 0) - (b.anio ?? 0)) * dir;
        case "serie": return (a.serie ?? "").localeCompare(b.serie ?? "") * dir;
        case "sucursal": return (a.sucursal ?? "").localeCompare(b.sucursal ?? "") * dir;
      }
    });
  }, [filtradas, sortKey, sortDir, cliById]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("asc"); }
  };

  const sortIcon = (k: SortKey) => {
    if (sortKey !== k) return <ArrowUpDown className="h-3 w-3 opacity-50" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };

  const exportar = () => {
    const hoy = new Date().getFullYear();
    const data = ordenadas.map((m) => ({
      Cliente: m.cliente_id ? cliById.get(m.cliente_id)?.nombre ?? "" : "",
      Sucursal: m.sucursal ?? "",
      Localidad: m.localidad ?? "",
      Marca: m.marca,
      Subgrupo: m.subgrupo,
      "Modelo/Tipo": m.modelo_tipo ?? "",
      Año: m.anio ?? "",
      "Antig.": m.anio ? hoy - m.anio : "",
      Serie: m.serie,
      Vendedor: m.vendedor ?? "",
      Estado: m.activo ? "Activa" : "Inactiva",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Maquinas");
    XLSX.writeFile(wb, `maquinas-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const lblCls = "text-[10px] uppercase tracking-wide text-muted-foreground font-medium";
  const hoy = new Date().getFullYear();

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1 min-w-[200px] flex-1">
          <span className={lblCls}>Buscar (cliente, serie, modelo)</span>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar..." className="pl-8" />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className={lblCls}>Sucursal</span>
          <Select value={fSucursal} onValueChange={setFSucursal}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {SUCURSALES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <span className={lblCls}>Marca</span>
          <Select value={fMarca} onValueChange={setFMarca}>
            <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {MARCAS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <span className={lblCls}>Subgrupo</span>
          <Select value={fSubgrupo} onValueChange={setFSubgrupo}>
            <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {SUBGRUPOS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <span className={lblCls}>Año desde</span>
          <Input type="number" value={anioDesde} onChange={(e) => setAnioDesde(e.target.value)} className="w-[100px]" placeholder="2010" />
        </div>
        <div className="flex flex-col gap-1">
          <span className={lblCls}>Año hasta</span>
          <Input type="number" value={anioHasta} onChange={(e) => setAnioHasta(e.target.value)} className="w-[100px]" placeholder={String(hoy)} />
        </div>

        <div className="flex flex-col gap-1">
          <span className={lblCls}>Estado</span>
          <Select value={fEstado} onValueChange={setFEstado}>
            <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="activa">Activas</SelectItem>
              <SelectItem value="inactiva">Inactivas</SelectItem>
              <SelectItem value="all">Todas</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button variant="outline" size="sm" onClick={exportar} className="ml-auto">
          <Download className="mr-1 h-4 w-4" /> Exportar
        </Button>
      </div>

      <div className="text-xs text-muted-foreground">{ordenadas.length} máquinas</div>

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
              <TableHead>Localidad</TableHead>
              <TableHead className="cursor-pointer" onClick={() => toggleSort("marca")}>
                <div className="flex items-center gap-1">Marca {sortIcon("marca")}</div>
              </TableHead>
              <TableHead className="cursor-pointer" onClick={() => toggleSort("subgrupo")}>
                <div className="flex items-center gap-1">Subgrupo {sortIcon("subgrupo")}</div>
              </TableHead>
              <TableHead>Modelo/Tipo</TableHead>
              <TableHead className="cursor-pointer text-center" onClick={() => toggleSort("anio")}>
                <div className="flex items-center justify-center gap-1">Año {sortIcon("anio")}</div>
              </TableHead>
              <TableHead className="text-center">Antig.</TableHead>
              <TableHead className="cursor-pointer" onClick={() => toggleSort("serie")}>
                <div className="flex items-center gap-1">Serie {sortIcon("serie")}</div>
              </TableHead>
              <TableHead>Vendedor</TableHead>
              <TableHead className="text-center">Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow><TableCell colSpan={11} className="h-20 text-center text-muted-foreground">Cargando...</TableCell></TableRow>
            )}
            {!loading && ordenadas.length === 0 && (
              <TableRow><TableCell colSpan={11} className="h-20 text-center text-muted-foreground">Sin máquinas.</TableCell></TableRow>
            )}
            {!loading && ordenadas.map((m) => {
              const cli = m.cliente_id ? cliById.get(m.cliente_id) : null;
              const antig = m.anio ? hoy - m.anio : null;
              return (
                <TableRow
                  key={m.id}
                  className={cn(onOpenCliente && cli && "cursor-pointer hover:bg-accent/40", !m.activo && "opacity-60")}
                  onClick={() => cli && onOpenCliente?.(cli.id)}
                >
                  <TableCell className="font-medium">{cli?.nombre ?? "—"}</TableCell>
                  <TableCell className="text-xs">{m.sucursal ?? "—"}</TableCell>
                  <TableCell className="text-xs">{m.localidad ?? "—"}</TableCell>
                  <TableCell><Badge variant="outline" className="text-[10px]">{m.marca}</Badge></TableCell>
                  <TableCell className="text-xs">{m.subgrupo}</TableCell>
                  <TableCell className="text-xs">{m.modelo_tipo ?? "—"}</TableCell>
                  <TableCell className="text-center tabular-nums">{m.anio ?? "—"}</TableCell>
                  <TableCell className="text-center tabular-nums text-xs">{antig != null ? `${antig}a` : "—"}</TableCell>
                  <TableCell className="text-xs font-mono">{m.serie}</TableCell>
                  <TableCell className="text-xs">{m.vendedor ?? "—"}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant={m.activo ? "default" : "secondary"} className="text-[10px]">
                      {m.activo ? "Activa" : "Inactiva"}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
