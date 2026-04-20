import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, CartesianGrid, LabelList } from "recharts";
import { ESTADOS, MARCAS, SUCURSALES, type Estado, type Marca, type Sucursal } from "@/lib/constants";
import { parseISO, isWithinInterval, startOfMonth, endOfMonth, format } from "date-fns";

interface Servicio {
  id: string; fecha_programada: string; tecnico_responsable_id: string | null;
  sucursal: Sucursal; marca: Marca; estado: Estado; horas_trabajadas: number | null;
}
interface Profile { id: string; nombre: string }

const COLORS_ESTADO: Record<Estado, string> = {
  Pendiente: "hsl(var(--estado-pendiente))",
  Iniciado: "hsl(var(--estado-iniciado))",
  Completado: "hsl(var(--estado-completado))",
};
const COLORS_MARCA: Record<Marca, string> = {
  CLAAS: "hsl(var(--marca-claas))",
  HORSCH: "hsl(var(--marca-horsch))",
};

export default function Dashboard() {
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [from, setFrom] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [to, setTo] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));

  useEffect(() => {
    Promise.all([
      supabase.from("servicios").select("id, fecha_programada, tecnico_responsable_id, sucursal, marca, estado, horas_trabajadas"),
      supabase.from("profiles").select("id, nombre"),
    ]).then(([s, p]) => {
      setServicios((s.data ?? []) as Servicio[]);
      setProfiles((p.data ?? []) as Profile[]);
    });
  }, []);

  const profById = useMemo(() => Object.fromEntries(profiles.map((p) => [p.id, p.nombre])), [profiles]);

  const filtered = useMemo(() => servicios.filter((s) => {
    const d = parseISO(s.fecha_programada);
    return isWithinInterval(d, { start: parseISO(from), end: parseISO(to) });
  }), [servicios, from, to]);

  const total = filtered.length;
  const completados = filtered.filter((s) => s.estado === "Completado").length;
  const pendientes = filtered.filter((s) => s.estado === "Pendiente").length;
  const totalHoras = filtered.reduce((acc, s) => acc + (s.horas_trabajadas ?? 0), 0);

  const porSucursal = SUCURSALES.map((s) => ({ name: s, total: filtered.filter((x) => x.sucursal === s).length }));
  // Solo nombre + apellido (primeras 2 palabras)
  const shortName = (n: string) => n.trim().split(/\s+/).slice(0, 2).join(" ");
  const porTecnico = profiles.map((p) => ({
    id: p.id,
    name: shortName(p.nombre),
    total: filtered.filter((x) => x.tecnico_responsable_id === p.id).length,
    horas: filtered.filter((x) => x.tecnico_responsable_id === p.id).reduce((a, x) => a + (x.horas_trabajadas ?? 0), 0),
  })).sort((a, b) => b.total - a.total || b.horas - a.horas);


  const porMarca = MARCAS.map((m) => ({ name: m, value: filtered.filter((x) => x.marca === m).length }));
  const porEstado = ESTADOS.map((e) => ({ name: e, value: filtered.filter((x) => x.estado === e).length }));

  return (
    <div className="container max-w-[1400px] py-4 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-xs text-muted-foreground">Resumen del período seleccionado</p>
        </div>
        <div className="flex gap-2">
          <div className="space-y-1"><Label className="text-xs">Desde</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9" /></div>
          <div className="space-y-1"><Label className="text-xs">Hasta</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9" /></div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KPI label="Total servicios" value={total} />
        <KPI label="Completados" value={`${completados} (${total ? Math.round(completados / total * 100) : 0}%)`} accent="completado" />
        <KPI label="Pendientes" value={pendientes} accent="pendiente" />
        <KPI label="Horas trabajadas" value={totalHoras.toFixed(1)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-3">Servicios por sucursal</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={porSucursal} margin={{ top: 20, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="name" fontSize={11} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} cursor={{ fill: "hsl(var(--accent))", opacity: 0.3 }} />
              <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]}>
                <LabelList dataKey="total" position="top" fontSize={11} fill="hsl(var(--foreground))" formatter={(v: number) => v > 0 ? v : ""} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-3">Distribución por estado</h3>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={porEstado}
                dataKey="value"
                nameKey="name"
                innerRadius={50}
                outerRadius={80}
                label={({ value, percent }) => value > 0 ? `${value} (${Math.round((percent ?? 0) * 100)}%)` : ""}
                labelLine={false}
              >
                {porEstado.map((e) => <Cell key={e.name} fill={COLORS_ESTADO[e.name as Estado]} />)}
              </Pie>
              <Legend />
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-3">Distribución por marca</h3>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart margin={{ top: 16, right: 16, bottom: 16, left: 16 }}>
              <Pie
                data={porMarca}
                dataKey="value"
                nameKey="name"
                innerRadius={45}
                outerRadius={75}
                label={({ name, value, percent }) => value > 0 ? `${name}: ${value} (${Math.round((percent ?? 0) * 100)}%)` : ""}
                labelLine={true}
              >
                {porMarca.map((e) => <Cell key={e.name} fill={COLORS_MARCA[e.name as Marca]} />)}
              </Pie>
              <Legend />
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-3 sm:p-4">
          <h3 className="text-sm font-semibold mb-2">Servicios y horas por técnico</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="h-8 text-[11px]">Técnico</TableHead>
                <TableHead className="h-8 text-[11px] text-right">Serv.</TableHead>
                <TableHead className="h-8 text-[11px] text-right">Horas</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {porTecnico.length === 0 ? (
                <TableRow><TableCell colSpan={3} className="text-center text-xs text-muted-foreground py-6">Sin datos en el período</TableCell></TableRow>
              ) : porTecnico.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="py-1.5 text-xs font-medium">{t.name}</TableCell>
                  <TableCell className="py-1.5 text-xs text-right tabular-nums">{t.total}</TableCell>
                  <TableCell className="py-1.5 text-xs text-right tabular-nums">{t.horas.toFixed(1)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}

function KPI({ label, value, accent }: { label: string; value: React.ReactNode; accent?: "completado" | "pendiente" }) {
  const accentClass = accent === "completado" ? "text-estado-completado" : accent === "pendiente" ? "text-estado-pendiente" : "";
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${accentClass}`}>{value}</div>
    </Card>
  );
}
