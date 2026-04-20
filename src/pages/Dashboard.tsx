import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, CartesianGrid } from "recharts";
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
  const porTecnico = profiles.map((p) => ({
    name: p.nombre.length > 14 ? p.nombre.slice(0, 14) + "…" : p.nombre,
    total: filtered.filter((x) => x.tecnico_responsable_id === p.id).length,
    horas: filtered.filter((x) => x.tecnico_responsable_id === p.id).reduce((a, x) => a + (x.horas_trabajadas ?? 0), 0),
  })).filter((x) => x.total > 0 || x.horas > 0);

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
            <BarChart data={porSucursal}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" fontSize={11} />
              <YAxis fontSize={11} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
              <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-3">Distribución por estado</h3>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={porEstado} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} label>
                {porEstado.map((e) => <Cell key={e.name} fill={COLORS_ESTADO[e.name as Estado]} />)}
              </Pie>
              <Legend />
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-3">Distribución por marca</h3>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={porMarca} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} label>
                {porMarca.map((e) => <Cell key={e.name} fill={COLORS_MARCA[e.name as Marca]} />)}
              </Pie>
              <Legend />
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-3">Servicios y horas por técnico</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={porTecnico} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis type="number" fontSize={11} />
              <YAxis dataKey="name" type="category" fontSize={11} width={100} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
              <Legend />
              <Bar dataKey="total" name="Servicios" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              <Bar dataKey="horas" name="Horas" fill="hsl(var(--marca-horsch))" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
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
