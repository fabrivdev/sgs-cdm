import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ROLES, ROLE_LABELS, SUCURSALES, type Role, type Sucursal } from "@/lib/constants";
import { toast } from "sonner";
import { UserPlus, Building2, Users } from "lucide-react";

interface Profile { id: string; nombre: string; sucursal: Sucursal | null; activo: boolean }
interface Cliente { id: string; nombre: string; sucursal: Sucursal | null }
interface UserRole { user_id: string; role: Role }

export default function Admin() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);

  // Form: nuevo usuario
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nombre, setNombre] = useState("");
  const [nuSucursal, setNuSucursal] = useState<Sucursal>(SUCURSALES[0]);
  const [nuRol, setNuRol] = useState<Role>("tecnico");
  const [busy, setBusy] = useState(false);

  // Cliente (sucursal opcional)
  const [cliNombre, setCliNombre] = useState("");
  const [cliSucursal, setCliSucursal] = useState<Sucursal | "">("");

  const load = async () => {
    const [{ data: prof }, { data: rls }, { data: cli }] = await Promise.all([
      supabase.from("profiles").select("id, nombre, sucursal, activo").order("nombre"),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("clientes").select("id, nombre, sucursal").order("nombre"),
    ]);
    setProfiles((prof ?? []) as Profile[]);
    setRoles((rls ?? []) as UserRole[]);
    setClientes((cli ?? []) as Cliente[]);
  };
  useEffect(() => { load(); }, []);

  const rolesByUser = roles.reduce<Record<string, Role[]>>((acc, r) => {
    (acc[r.user_id] ??= []).push(r.role); return acc;
  }, {});

  const crearUsuario = async () => {
    if (!email || !password || !nombre) { toast.error("Email, contraseña y nombre son obligatorios"); return; }
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("admin-create-user", {
      body: { email, password, nombre, sucursal: nuSucursal, role: nuRol },
    });
    setBusy(false);
    if (error || data?.error) { toast.error(error?.message || data?.error); return; }
    toast.success("Usuario creado");
    setEmail(""); setPassword(""); setNombre("");
    load();
  };

  const toggleActivo = async (p: Profile) => {
    const { error } = await supabase.from("profiles").update({ activo: !p.activo }).eq("id", p.id);
    if (error) toast.error(error.message); else load();
  };

  const cambiarRol = async (userId: string, role: Role) => {
    await supabase.from("user_roles").delete().eq("user_id", userId);
    const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
    if (error) toast.error(error.message); else { toast.success("Rol actualizado"); load(); }
  };

  const cambiarSucursal = async (id: string, sucursal: Sucursal) => {
    const { error } = await supabase.from("profiles").update({ sucursal }).eq("id", id);
    if (error) toast.error(error.message); else load();
  };

  const crearCliente = async () => {
    if (!cliNombre.trim()) return;
    const { error } = await supabase.from("clientes").insert({ nombre: cliNombre.trim(), sucursal: cliSucursal || null });
    if (error) toast.error(error.message);
    else { toast.success("Cliente creado"); setCliNombre(""); setCliSucursal(""); load(); }
  };

  return (
    <div className="container max-w-6xl py-4 space-y-4">
      <h1 className="text-2xl font-bold">Administración</h1>

      <Tabs defaultValue="usuarios">
        <TabsList>
          <TabsTrigger value="usuarios"><Users className="mr-2 h-4 w-4" />Usuarios</TabsTrigger>
          <TabsTrigger value="clientes"><Building2 className="mr-2 h-4 w-4" />Clientes</TabsTrigger>
        </TabsList>

        <TabsContent value="usuarios" className="space-y-4">
          <Card className="p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><UserPlus className="h-4 w-4" /> Crear nuevo usuario</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div><Label className="text-xs">Nombre</Label><Input value={nombre} onChange={(e) => setNombre(e.target.value)} /></div>
              <div><Label className="text-xs">Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
              <div><Label className="text-xs">Contraseña</Label><Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
              <div>
                <Label className="text-xs">Sucursal</Label>
                <Select value={nuSucursal} onValueChange={(v) => setNuSucursal(v as Sucursal)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{SUCURSALES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Rol</Label>
                <Select value={nuRol} onValueChange={(v) => setNuRol(v as Role)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <Button className="mt-3" onClick={crearUsuario} disabled={busy}>{busy ? "Creando…" : "Crear usuario"}</Button>
          </Card>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Sucursal</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Activo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {profiles.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.nombre}</TableCell>
                    <TableCell>
                      <Select value={p.sucursal ?? ""} onValueChange={(v) => cambiarSucursal(p.id, v as Sucursal)}>
                        <SelectTrigger className="h-8 w-40"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>{SUCURSALES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select value={rolesByUser[p.id]?.[0] ?? ""} onValueChange={(v) => cambiarRol(p.id, v as Role)}>
                        <SelectTrigger className="h-8 w-40"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}</SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Button variant={p.activo ? "default" : "outline"} size="sm" onClick={() => toggleActivo(p)}>
                        {p.activo ? "Activo" : "Inactivo"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="clientes" className="space-y-4">
          <Card className="p-4">
            <h3 className="mb-3 text-sm font-semibold">Crear cliente</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <div><Label className="text-xs">Nombre</Label><Input value={cliNombre} onChange={(e) => setCliNombre(e.target.value)} /></div>
              <div>
                <Label className="text-xs">Sucursal principal (opcional)</Label>
                <Select value={cliSucursal || "none"} onValueChange={(v) => setCliSucursal(v === "none" ? "" : (v as Sucursal))}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Ninguna —</SelectItem>
                    {SUCURSALES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end"><Button onClick={crearCliente}>Agregar</Button></div>
            </div>
          </Card>

          <Card>
            <Table>
              <TableHeader><TableRow><TableHead>Nombre</TableHead><TableHead>Sucursal principal</TableHead></TableRow></TableHeader>
              <TableBody>
                {clientes.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.nombre}</TableCell>
                    <TableCell>{c.sucursal ? <Badge variant="outline">{c.sucursal}</Badge> : <span className="text-muted-foreground">—</span>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
