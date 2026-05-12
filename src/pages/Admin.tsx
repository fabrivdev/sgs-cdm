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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ROLES, ROLE_LABELS, SUCURSALES, type Role, type Sucursal } from "@/lib/constants";
import { toast } from "sonner";
import { UserPlus, Building2, Users, KeyRound, ShieldAlert, Trash2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/useAuth";

interface Profile { id: string; nombre: string; sucursal: Sucursal | null; activo: boolean }
interface Cliente { id: string; nombre: string; sucursal: Sucursal | null }
interface UserRole { user_id: string; role: Role }

export default function Admin() {
  const { isSuperAdmin } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [emails, setEmails] = useState<Record<string, string>>({});

  // Form: nuevo usuario
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nombre, setNombre] = useState("");
  const [nuSucursal, setNuSucursal] = useState<Sucursal>(SUCURSALES[0]);
  const [nuRol, setNuRol] = useState<Role>("tecnico");
  const [busy, setBusy] = useState(false);

  // Cliente
  const [cliNombre, setCliNombre] = useState("");
  const [cliSucursal, setCliSucursal] = useState<Sucursal | "">("");

  // Credenciales dialog
  const [credUser, setCredUser] = useState<Profile | null>(null);
  const [credEmail, setCredEmail] = useState("");
  const [credPassword, setCredPassword] = useState("");
  const [credBusy, setCredBusy] = useState(false);

  // Eliminar usuario
  const [delUser, setDelUser] = useState<Profile | null>(null);
  const [delBusy, setDelBusy] = useState(false);

  const load = async () => {
    const [{ data: prof }, { data: rls }, { data: cli }] = await Promise.all([
      supabase.from("profiles").select("id, nombre, sucursal, activo").order("nombre"),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("clientes").select("id, nombre, sucursal").order("nombre"),
    ]);
    setProfiles((prof ?? []) as Profile[]);
    setRoles((rls ?? []) as UserRole[]);
    setClientes((cli ?? []) as Cliente[]);

    // Cargar emails vía edge function
    const { data: emailData, error: emailErr } = await supabase.functions.invoke("admin-list-users");
    if (!emailErr && emailData?.users) {
      const map: Record<string, string> = {};
      for (const u of emailData.users as { user_id: string; email: string }[]) {
        map[u.user_id] = u.email;
      }
      setEmails(map);
    }
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

  const openCred = (p: Profile) => {
    setCredUser(p);
    setCredEmail(emails[p.id] ?? "");
    setCredPassword("");
  };

  const guardarCred = async () => {
    if (!credUser) return;
    const original = emails[credUser.id] ?? "";
    const payload: { user_id: string; email?: string; password?: string } = { user_id: credUser.id };
    if (credEmail.trim() && credEmail.trim() !== original) payload.email = credEmail.trim();
    if (credPassword) payload.password = credPassword;
    if (!payload.email && !payload.password) { toast.info("No hay cambios"); return; }
    setCredBusy(true);
    const { data, error } = await supabase.functions.invoke("admin-update-user", { body: payload });
    setCredBusy(false);
    if (error || data?.error) { toast.error(error?.message || data?.error); return; }
    toast.success("Credenciales actualizadas");
    setCredUser(null);
    load();
  };

  const eliminarUsuario = async () => {
    if (!delUser) return;
    setDelBusy(true);
    const { data, error } = await supabase.functions.invoke("admin-delete-user", {
      body: { user_id: delUser.id },
    });
    setDelBusy(false);
    if (error || data?.error) { toast.error(error?.message || data?.error); return; }
    toast.success("Usuario eliminado");
    setDelUser(null);
    load();
  };

  return (
    <div className="container max-w-6xl py-3 px-3 sm:py-4 space-y-4">
      <h1 className="text-2xl font-bold">Administración</h1>

      <Tabs defaultValue="usuarios">
        <TabsList>
          <TabsTrigger value="usuarios"><Users className="mr-2 h-4 w-4" />Usuarios</TabsTrigger>
          <TabsTrigger value="clientes"><Building2 className="mr-2 h-4 w-4" />Clientes</TabsTrigger>
        </TabsList>

        <TabsContent value="usuarios" className="space-y-4">
          {!isSuperAdmin && (
            <Card className="p-3 sm:p-4 flex items-start gap-3 border-amber-500/40 bg-amber-500/5">
              <ShieldAlert className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <div className="text-xs">
                <div className="font-semibold text-amber-700">Solo lectura</div>
                <div className="text-muted-foreground">
                  Únicamente el super administrador puede crear usuarios o modificar credenciales, roles y sucursales.
                </div>
              </div>
            </Card>
          )}

          {isSuperAdmin && (
            <Card className="p-3 sm:p-4">
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
          )}

          {/* Desktop table */}
          <Card className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Sucursal</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Activo</TableHead>
                  {isSuperAdmin && <TableHead className="w-[100px]">Acciones</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {profiles.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.nombre}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{emails[p.id] ?? "—"}</TableCell>
                    <TableCell>
                      {isSuperAdmin ? (
                        <Select value={p.sucursal ?? ""} onValueChange={(v) => cambiarSucursal(p.id, v as Sucursal)}>
                          <SelectTrigger className="h-8 w-40"><SelectValue placeholder="—" /></SelectTrigger>
                          <SelectContent>{SUCURSALES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                        </Select>
                      ) : (
                        <span className="text-xs">{p.sucursal ?? "—"}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {isSuperAdmin ? (
                        <Select value={rolesByUser[p.id]?.[0] ?? ""} onValueChange={(v) => cambiarRol(p.id, v as Role)}>
                          <SelectTrigger className="h-8 w-40"><SelectValue placeholder="—" /></SelectTrigger>
                          <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}</SelectContent>
                        </Select>
                      ) : (
                        <Badge variant="outline">{ROLE_LABELS[rolesByUser[p.id]?.[0] as Role] ?? "—"}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {isSuperAdmin ? (
                        <Button variant={p.activo ? "default" : "outline"} size="sm" onClick={() => toggleActivo(p)}>
                          {p.activo ? "Activo" : "Inactivo"}
                        </Button>
                      ) : (
                        <Badge variant={p.activo ? "default" : "outline"}>{p.activo ? "Activo" : "Inactivo"}</Badge>
                      )}
                    </TableCell>
                    {isSuperAdmin && (
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="outline" size="sm" onClick={() => openCred(p)} title="Credenciales">
                            <KeyRound className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => setDelUser(p)} title="Eliminar usuario" className="text-destructive hover:text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {profiles.map((p) => (
              <Card key={p.id} className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold truncate">{p.nombre}</div>
                    <div className="text-[11px] text-muted-foreground truncate">{emails[p.id] ?? "—"}</div>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    {isSuperAdmin && (
                      <>
                        <Button variant="outline" size="sm" onClick={() => openCred(p)} className="h-7 px-2">
                          <KeyRound className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setDelUser(p)} className="h-7 px-2 text-destructive hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant={p.activo ? "default" : "outline"}
                          size="sm"
                          onClick={() => toggleActivo(p)}
                          className="h-7 px-2 text-[10px]"
                        >
                          {p.activo ? "Activo" : "Inactivo"}
                        </Button>
                      </>
                    )}
                    {!isSuperAdmin && (
                      <Badge variant={p.activo ? "default" : "outline"} className="text-[10px]">
                        {p.activo ? "Activo" : "Inactivo"}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Sucursal</Label>
                    {isSuperAdmin ? (
                      <Select value={p.sucursal ?? ""} onValueChange={(v) => cambiarSucursal(p.id, v as Sucursal)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>{SUCURSALES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                      </Select>
                    ) : (
                      <div className="text-xs py-1.5">{p.sucursal ?? "—"}</div>
                    )}
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Rol</Label>
                    {isSuperAdmin ? (
                      <Select value={rolesByUser[p.id]?.[0] ?? ""} onValueChange={(v) => cambiarRol(p.id, v as Role)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}</SelectContent>
                      </Select>
                    ) : (
                      <div className="text-xs py-1.5">{ROLE_LABELS[rolesByUser[p.id]?.[0] as Role] ?? "—"}</div>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="clientes" className="space-y-4">
          <Card className="p-3 sm:p-4">
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

      {/* Credenciales dialog */}
      <Dialog open={!!credUser} onOpenChange={(o) => !o && setCredUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Credenciales — {credUser?.nombre}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Email</Label>
              <Input type="email" value={credEmail} onChange={(e) => setCredEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Nueva contraseña</Label>
              <Input
                type="text"
                value={credPassword}
                onChange={(e) => setCredPassword(e.target.value)}
                placeholder="Dejar vacío para no cambiar"
              />
              <p className="text-[11px] text-muted-foreground">Mínimo 6 caracteres si la cambiás.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCredUser(null)}>Cancelar</Button>
            <Button onClick={guardarCred} disabled={credBusy}>{credBusy ? "Guardando…" : "Guardar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
