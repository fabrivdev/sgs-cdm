import { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, History } from "lucide-react";
import { toast } from "sonner";
import { SUCURSALES, MARCAS, type Sucursal, type Marca } from "@/lib/constants";
import { cn } from "@/lib/utils";

const SUBGRUPOS_VALIDOS = new Set([
  "COSECHADORAS",
  "SEMBRADORAS",
  "PICADORAS",
  "PLATAFORMAS",
  "PULVERIZADORAS",
  "TRACTORES",
  "OTRO",
]);

interface ParqueRow {
  anio: number | null;
  sucursal: Sucursal | null;
  subgrupo: string;
  modelo_tipo: string | null;
  serie: string;
  cliente_nombre: string;
  marca: Marca;
  vendedor: string | null;
  localidad: string | null;
  _isNew: boolean;
}
interface FactRow {
  fecha: string;
  sucursal: Sucursal | null;
  entidad_nombre: string;
  cod_entidad: string | null;
  total_venta: number;
  grupo: string | null;
  cod_factura: string;
  tipo: "Repuesto" | "Servicio";
  _isNew: boolean;
}

interface Imp {
  id: string;
  tipo: "parque" | "facturacion";
  total_filas: number;
  insertados: number;
  duplicados: number;
  archivo_nombre: string | null;
  creado_en: string;
  usuario_id: string | null;
}

const norm = (s: unknown) => String(s ?? "").trim();
const lower = (s: unknown) => norm(s).toLowerCase();

const parseExcelDate = (v: unknown): string | null => {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  // dd/mm/yyyy o dd-mm-yyyy
  const m = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})$/);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = "20" + y;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  return null;
};

const matchSucursal = (s: unknown): Sucursal | null => {
  const v = lower(s);
  return (SUCURSALES.find((x) => x.toLowerCase() === v) ?? null) as Sucursal | null;
};
const matchMarca = (s: unknown): Marca | null => {
  const v = lower(s);
  return (MARCAS.find((x) => x.toLowerCase() === v) ?? null) as Marca | null;
};

export function ImportarTab({ onChanged }: { onChanged: () => void }) {
  const { user } = useAuth();
  const [parqueRows, setParqueRows] = useState<ParqueRow[] | null>(null);
  const [parqueFile, setParqueFile] = useState<string>("");
  const [factRows, setFactRows] = useState<FactRow[] | null>(null);
  const [factFile, setFactFile] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [historial, setHistorial] = useState<Imp[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});

  const cargarHistorial = async () => {
    const [imp, prof] = await Promise.all([
      supabase.from("importaciones").select("*").order("creado_en", { ascending: false }).limit(20),
      supabase.from("profiles").select("id, nombre"),
    ]);
    setHistorial((imp.data ?? []) as Imp[]);
    setProfiles(
      Object.fromEntries(((prof.data ?? []) as { id: string; nombre: string }[]).map((u) => [u.id, u.nombre])),
    );
  };

  useEffect(() => { cargarHistorial(); }, []);

  // ===== Procesar Parque =====
  const procesarParque = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });
      if (json.length === 0) return toast.error("Excel vacío");

      // Match series existentes
      const seriesExistentes = new Set<string>();
      const { data: existentes } = await supabase.from("parque_maquinas").select("serie");
      for (const e of existentes ?? []) seriesExistentes.add(e.serie.toLowerCase());

      const rows: ParqueRow[] = [];
      for (const r of json) {
        const serie = norm(r["SERIE"] ?? r["serie"]);
        if (!serie) continue;
        const marca = matchMarca(r["MARCA"] ?? r["marca"]) ?? "CLAAS";
        const subRaw = norm(r["SUBGRUPO"] ?? r["subgrupo"]).toUpperCase();
        const subgrupo = SUBGRUPOS_VALIDOS.has(subRaw) ? subRaw : "OTRO";
        const anioVal = r["AÑO"] ?? r["ANO"] ?? r["ANIO"] ?? r["año"];
        const anio = anioVal ? Number(anioVal) || null : null;
        rows.push({
          anio,
          sucursal: matchSucursal(r["SUCURSAL"] ?? r["sucursal"]),
          subgrupo,
          modelo_tipo: norm(r["MODELO_TIPO"] ?? r["MODELO"] ?? r["modelo_tipo"]) || null,
          serie,
          cliente_nombre: norm(r["CLIENTE"] ?? r["cliente"]),
          marca,
          vendedor: norm(r["VENDEDOR"] ?? r["vendedor"]) || null,
          localidad: norm(r["LOCALIDAD"] ?? r["localidad"]) || null,
          _isNew: !seriesExistentes.has(serie.toLowerCase()),
        });
      }
      setParqueRows(rows);
      setParqueFile(file.name);
    } catch (e) {
      toast.error("Error leyendo archivo: " + (e as Error).message);
    }
  };

  const confirmarParque = async () => {
    if (!parqueRows || !user) return;
    const nuevos = parqueRows.filter((r) => r._isNew);
    if (nuevos.length === 0) return toast.info("No hay registros nuevos");
    setBusy(true);
    try {
      // Resolver clientes: crear los que no existen
      const nombresUnicos = Array.from(new Set(nuevos.map((r) => r.cliente_nombre).filter(Boolean)));
      const { data: cliExistentes } = await supabase
        .from("clientes")
        .select("id, nombre")
        .in("nombre", nombresUnicos);
      const cliMap = new Map<string, string>();
      for (const c of cliExistentes ?? []) cliMap.set(c.nombre.toLowerCase(), c.id);

      const aCrear = nombresUnicos.filter((n) => !cliMap.has(n.toLowerCase()));
      if (aCrear.length > 0) {
        // Buscar sucursal predominante por cliente
        const sucPorCliente = new Map<string, Sucursal | null>();
        for (const r of nuevos) {
          if (r.cliente_nombre && !sucPorCliente.has(r.cliente_nombre.toLowerCase())) {
            sucPorCliente.set(r.cliente_nombre.toLowerCase(), r.sucursal);
          }
        }
        const insertCli = aCrear.map((n) => ({
          nombre: n,
          sucursal: sucPorCliente.get(n.toLowerCase()) ?? null,
        }));
        const { data: creados, error: errCli } = await supabase
          .from("clientes")
          .insert(insertCli)
          .select("id, nombre");
        if (errCli) throw errCli;
        for (const c of creados ?? []) cliMap.set(c.nombre.toLowerCase(), c.id);
      }

      const insertMaq = nuevos.map((r) => ({
        cliente_id: r.cliente_nombre ? cliMap.get(r.cliente_nombre.toLowerCase()) ?? null : null,
        anio: r.anio,
        sucursal: r.sucursal,
        localidad: r.localidad,
        subgrupo: r.subgrupo as never,
        modelo_tipo: r.modelo_tipo,
        serie: r.serie,
        vendedor: r.vendedor,
        marca: r.marca,
        agregado_manualmente: false,
      }));
      const { error } = await supabase.from("parque_maquinas").insert(insertMaq);
      if (error) throw error;

      await supabase.from("importaciones").insert({
        usuario_id: user.id,
        tipo: "parque",
        total_filas: parqueRows.length,
        insertados: nuevos.length,
        duplicados: parqueRows.length - nuevos.length,
        archivo_nombre: parqueFile,
      });

      toast.success(`Importadas ${nuevos.length} máquinas`);
      setParqueRows(null);
      setParqueFile("");
      await cargarHistorial();
      onChanged();
    } catch (e) {
      toast.error("Error: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // ===== Procesar Facturación =====
  const procesarFact = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });
      if (json.length === 0) return toast.error("Excel vacío");

      const codsExistentes = new Set<string>();
      const { data: existentes } = await supabase.from("facturacion").select("cod_factura");
      for (const e of existentes ?? []) codsExistentes.add(e.cod_factura.toLowerCase());

      const rows: FactRow[] = [];
      for (const r of json) {
        const cod = norm(r["Código Factura"] ?? r["Codigo Factura"] ?? r["cod_factura"]);
        if (!cod) continue;
        const fecha = parseExcelDate(r["Fecha Factura"] ?? r["Fecha"] ?? r["fecha"]);
        if (!fecha) continue;
        const tipoRaw = norm(r["Tipo"] ?? r["tipo"]);
        const tipo: "Repuesto" | "Servicio" =
          tipoRaw.toLowerCase().startsWith("serv") ? "Servicio" : "Repuesto";
        const totalRaw = r["Total Venta"] ?? r["total_venta"] ?? 0;
        rows.push({
          fecha,
          sucursal: matchSucursal(r["Sucursal"] ?? r["sucursal"]),
          entidad_nombre: norm(r["Entidad"] ?? r["entidad"]),
          cod_entidad: norm(r["Cod. Entidad"] ?? r["Cod Entidad"] ?? r["cod_entidad"]) || null,
          total_venta: typeof totalRaw === "number" ? totalRaw : Number(String(totalRaw).replace(/[^0-9.-]/g, "")) || 0,
          grupo: norm(r["Grupo"] ?? r["grupo"]) || null,
          cod_factura: cod,
          tipo,
          _isNew: !codsExistentes.has(cod.toLowerCase()),
        });
      }
      setFactRows(rows);
      setFactFile(file.name);
    } catch (e) {
      toast.error("Error leyendo archivo: " + (e as Error).message);
    }
  };

  const confirmarFact = async () => {
    if (!factRows || !user) return;
    const nuevos = factRows.filter((r) => r._isNew);
    if (nuevos.length === 0) return toast.info("No hay registros nuevos");
    setBusy(true);
    try {
      // Match clientes por nombre
      const nombresUnicos = Array.from(new Set(nuevos.map((r) => r.entidad_nombre).filter(Boolean)));
      const { data: cliExistentes } = await supabase
        .from("clientes")
        .select("id, nombre")
        .in("nombre", nombresUnicos);
      const cliMap = new Map<string, string>();
      for (const c of cliExistentes ?? []) cliMap.set(c.nombre.toLowerCase(), c.id);
      const aCrear = nombresUnicos.filter((n) => !cliMap.has(n.toLowerCase()));
      if (aCrear.length > 0) {
        const insertCli = aCrear.map((n) => {
          const r = nuevos.find((x) => x.entidad_nombre === n);
          return { nombre: n, sucursal: r?.sucursal ?? null };
        });
        const { data: creados, error: errCli } = await supabase
          .from("clientes")
          .insert(insertCli)
          .select("id, nombre");
        if (errCli) throw errCli;
        for (const c of creados ?? []) cliMap.set(c.nombre.toLowerCase(), c.id);
      }

      const insertF = nuevos.map((r) => ({
        fecha: r.fecha,
        sucursal: r.sucursal,
        tipo: r.tipo as never,
        cliente_id: r.entidad_nombre ? cliMap.get(r.entidad_nombre.toLowerCase()) ?? null : null,
        entidad_nombre: r.entidad_nombre,
        cod_entidad: r.cod_entidad,
        total_venta: r.total_venta,
        grupo: r.grupo,
        cod_factura: r.cod_factura,
      }));
      // Insertar en chunks de 500
      for (let i = 0; i < insertF.length; i += 500) {
        const chunk = insertF.slice(i, i + 500);
        const { error } = await supabase.from("facturacion").insert(chunk);
        if (error) throw error;
      }

      await supabase.from("importaciones").insert({
        usuario_id: user.id,
        tipo: "facturacion",
        total_filas: factRows.length,
        insertados: nuevos.length,
        duplicados: factRows.length - nuevos.length,
        archivo_nombre: factFile,
      });

      toast.success(`Importadas ${nuevos.length} facturas`);
      setFactRows(null);
      setFactFile("");
      await cargarHistorial();
      onChanged();
    } catch (e) {
      toast.error("Error: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <DropZone
          title="Importar parque de máquinas"
          help="Columnas esperadas: AÑO, SUCURSAL, SUBGRUPO, MODELO_TIPO, SERIE, CLIENTE, MARCA, VENDEDOR, LOCALIDAD"
          onFile={procesarParque}
        />
        <DropZone
          title="Importar facturación"
          help="Columnas esperadas: Fecha Factura, Sucursal, Entidad, Cod. Entidad, Total Venta, Grupo, Código Factura, Tipo"
          onFile={procesarFact}
        />
      </div>

      {parqueRows && (
        <Preview
          title={`Parque — ${parqueFile}`}
          rows={parqueRows}
          columns={["anio", "sucursal", "subgrupo", "modelo_tipo", "serie", "cliente_nombre", "marca"]}
          onConfirm={confirmarParque}
          onCancel={() => setParqueRows(null)}
          busy={busy}
        />
      )}

      {factRows && (
        <Preview
          title={`Facturación — ${factFile}`}
          rows={factRows}
          columns={["fecha", "sucursal", "entidad_nombre", "cod_factura", "tipo", "total_venta"]}
          onConfirm={confirmarFact}
          onCancel={() => setFactRows(null)}
          busy={busy}
        />
      )}

      {/* Historial */}
      <Card>
        <CardContent className="p-3 sm:p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <History className="h-4 w-4 text-primary" /> Historial de importaciones
          </div>
          {historial.length === 0 ? (
            <div className="text-xs text-muted-foreground">Sin importaciones registradas.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Usuario</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Archivo</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Insertados</TableHead>
                    <TableHead className="text-right">Duplicados</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historial.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell className="text-xs">{new Date(h.creado_en).toLocaleString("es-PY", { dateStyle: "short", timeStyle: "short" })}</TableCell>
                      <TableCell className="text-xs">{h.usuario_id ? profiles[h.usuario_id] ?? "—" : "—"}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{h.tipo}</Badge></TableCell>
                      <TableCell className="text-xs truncate max-w-[180px]">{h.archivo_nombre ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{h.total_filas}</TableCell>
                      <TableCell className="text-right tabular-nums text-emerald-600 font-medium">{h.insertados}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{h.duplicados}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function DropZone({ title, help, onFile }: { title: string; help: string; onFile: (f: File) => void }) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div
      className={cn(
        "rounded-lg border-2 border-dashed p-4 text-center transition-colors",
        drag ? "border-primary bg-primary/5" : "border-border bg-card",
      )}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        const f = e.dataTransfer.files?.[0];
        if (f) onFile(f);
      }}
    >
      <FileSpreadsheet className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
      <div className="font-medium text-sm">{title}</div>
      <div className="mb-3 mt-1 text-[11px] text-muted-foreground">{help}</div>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
      <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
        <Upload className="mr-1 h-3.5 w-3.5" /> Seleccionar archivo
      </Button>
      <div className="mt-1 text-[10px] text-muted-foreground">o arrastrá el archivo aquí</div>
    </div>
  );
}

function Preview<T extends { _isNew: boolean }>({
  title,
  rows,
  columns,
  onConfirm,
  onCancel,
  busy,
}: {
  title: string;
  rows: T[];
  columns: string[];
  onConfirm: () => void;
  onCancel: () => void;
  busy: boolean;
}) {
  const nuevos = rows.filter((r) => r._isNew).length;
  const duplicados = rows.length - nuevos;
  const preview = rows.slice(0, 10);
  return (
    <Card>
      <CardContent className="p-3 sm:p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="font-semibold text-sm">{title}</div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{rows.length} filas</Badge>
            <Badge className="bg-emerald-600 text-white">
              <CheckCircle2 className="mr-1 h-3 w-3" /> {nuevos} nuevos
            </Badge>
            <Badge variant="secondary">
              <AlertCircle className="mr-1 h-3 w-3" /> {duplicados} duplicados
            </Badge>
          </div>
        </div>
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                {columns.map((c) => <TableHead key={c} className="whitespace-nowrap text-[11px]">{c}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.map((r, i) => (
                <TableRow key={i} className={!r._isNew ? "opacity-50" : ""}>
                  <TableCell>
                    {r._isNew ? (
                      <Badge className="bg-emerald-600 text-white text-[9px]">Nuevo</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[9px]">Dup.</Badge>
                    )}
                  </TableCell>
                  {columns.map((c) => (
                    <TableCell key={c} className="whitespace-nowrap text-xs">
                      {String((r as Record<string, unknown>)[c] ?? "—")}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={busy}>Cancelar</Button>
          <Button size="sm" onClick={onConfirm} disabled={busy || nuevos === 0}>
            {busy ? "Importando..." : `Confirmar (${nuevos})`}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
