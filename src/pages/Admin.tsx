import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ROLES, ROLE_LABELS, SUCURSALES, type Role, type Sucursal } from "@/lib/constants";
import { toast } from "sonner";
import { Building2, KeyRound, ShieldAlert, Trash2, UserPlus, Users } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/useAuth";

interface Profile {
  id: string;
  auth_user_id: string | null;
  nombre: string;
  sucursal: Sucursal | null;
  activo: boolean;
}

interface Cliente {
  id: string;
  nombre: string;
  sucursal: Sucursal | null;
}

interface UserRole {
  user_id: string;
  role: Role;
}

export default function Admin() {
  const { isSuperAdmin } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [emails, setEmails] = useState<Record<string, string>>({});

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nombre, setNombre] = useState("");
  const [nuSucursal, setNuSucursal] = useState<Sucursal>(SUCURSALES[0]);
  const [nuRol, setNuRol] = useState<Role>("tecnico");
  const [busy, setBusy] = useState(false);

  const [cliNombre, setCliNombre] = useState("");
  const [cliSucursal, setCliSucursal] = useState<Sucursal | "">("");

  const [credUser, setCredUser] = useState<Profile | null>(null);
  const [credEmail, setCredEmail] = useState("");
  const [credPassword, setCredPassword] = useState("");
  const [credBusy, setCredBusy] = useState(false);

  const [delUser, setDelUser] = useState<Profile | null>(null);
  const [delBusy, setDelBusy] = useState(false);

  const rolesByUser = useMemo(
    () =>
      roles.reduce<Record<string, Role[]>>((acc, item) => {
        (acc[item.user_id] ??= []).push(item.role);
        return acc;
      }, {}),
    [roles],
  );

  const emailByProfile = (profile: Profile) => {
    if (!profile.auth_user_id) return "";
    return emails[profile.auth_user_id] ?? "";
  };

  const load = async () => {
    const [{ data: prof }, { data: roleRows }, { data: cli }] = await Promise.all([
      supabase.from("profiles").select("id, auth_user_id, nombre, sucursal, activo").order("nombre"),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("clientes").select("id, nombre, sucursal").order("nombre"),
    ]);
    setProfiles((prof ?? []) as Profile[]);
    setRoles((roleRows ?? []) as UserRole[]);
    setClientes((cli ?? []) as Cliente[]);

    const { data: emailData, error: emailErr } = await supabase.functions.invoke("admin-list-users");
    if (!emailErr && emailData?.users) {
      const map: Record<string, string> = {};
      for (const userItem of emailData.users as { user_id: string; email: string }[]) {
        map[userItem.user_id] = userItem.email;
      }
      setEmails(map);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const crearUsuario = async () => {
    if (!email.trim() || !password.trim() || !nombre.trim()) {
      toast.error("Email, contraseña y nombre son obligatorios");
      return;
    }

    setBusy(true);
    const { data, error } = await supabase.functions.invoke("admin-create-user", {
      body: { email: email.trim(), password, nombre: nombre.trim(), sucursal: nuSucursal, role: nuRol },
    });
    setBusy(false);

    if (error || data?.error) {
      toast.error(error?.message || data?.error);
      return;
    }

    toast.success("Usuario creado");
    setEmail("");
    setPassword("");
    setNombre("");
    load();
  };

  const toggleActivo = async (profile: Profile) => {
    const { error } = await supabase.from("profiles").update({ activo: !profile.activo }).eq("id", profile.id);
    if (error) toast.error(error.message);
    else load();
  };

  const cambiarRol = async (userId: string, role: Role) => {
    await supabase.from("user_roles").delete().eq("user_id", userId);
    const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
    if (error) toast.error(error.message);
    else {
      toast.success("Rol actualizado");
      load();
    }
  };

  const cambiarSucursal = async (id: string, sucursal: Sucursal) => {
    const { error } = await supabase.from("profiles").update({ sucursal }).eq("id", id);
    if (error) toast.error(error.message);
    else load();
  };

  const crearCliente = async () => {
    if (!cliNombre.trim()) return;
    const { error } = await supabase.from("clientes").insert({ nombre: cliNombre.trim(), sucursal: cliSucursal || null });
    if (error) toast.error(error.message);
    else {
      toast.success("Cliente creado");
      setCliNombre("");
      setCliSucursal("");
      load();
    }
  };

  const openCred = (profile: Profile) => {
    setCredUser(profile);
    setCredEmail(emailByProfile(profile));
    setCredPassword("");
  };

  const guardarCred = async () => {
    if (!credUser) return;
    if (!credEmail.trim()) {
      toast.error("Indica el email del técnico");
      return;
    }

    if (!credUser.auth_user_id && !credPassword.trim()) {
      toast.error("Para crear el acceso inicial hace falta una contraseña");
      return;
    }

    setCredBusy(true);

    const runner = credUser.auth_user_id
      ? supabase.functions.invoke("admin-update-user", {
          body: { profile_id: credUser.id, email: credEmail.trim(), password: credPassword || undefined },
        })
      : supabase.functions.invoke("admin-create-user", {
          body: {
            profile_id: credUser.id,
            email: credEmail.trim(),
            password: credPassword,
          },
        });

    const { data, error } = await runner;
    setCredBusy(false);

    if (error || data?.error) {
      toast.error(error?.message || data?.error);
      return;
    }

    toast.success(credUser.auth_user_id ? "Credenciales actualizadas" : "Acceso asociado al técnico");
    setCredUser(null);
    load();
  };

  const eliminarUsuario = async () => {
    if (!delUser) return;
    setDelBusy(true);
    const { data, error } = await supabase.functions.invoke("admin-delete-user", {
      body: { profile_id: delUser.id },
    });
    setDelBusy(false);
    if (error || data?.error) {
      toast.error(error?.message || data?.error);
      return;
    }
    toast.success("Acceso eliminado. El técnico sigue existiendo.");
    setDelUser(null);
    load();
  };

  return (
    <div className="container max-w-6xl space-y-4 px-3 py-3 sm:py-4">
      <h1 className="text-2xl font-bold">Administración</h1>

      <Tabs defaultValue="usuarios">
        <TabsList>
          <TabsTrigger value="usuarios">
            <Users className="mr-2 h-4 w-4" />
            Usuarios
          </TabsTrigger>
          <TabsTrigger value="clientes">
            <Building2 className="mr-2 h-4 w-4" />
            Clientes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="usuarios" className="space-y-4">
          {!isSuperAdmin && (
            <Card className="flex items-start gap-3 border-amber-500/40 bg-amber-500/5 p-3 sm:p-4">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
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
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <UserPlus className="h-4 w-4" />
                Crear nuevo usuario desde cero
              </h3>
              <p className="mb-3 text-xs text-muted-foreground">
                Para los técnicos que ya existen, usá el botón de credenciales en la tabla de abajo.
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <div>
                  <Label className="text-xs">Nombre</Label>
                  <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Email</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Contraseña</Label>
                  <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Sucursal</Label>
                  <Select value={nuSucursal} onValueChange={(value) => setNuSucursal(value as Sucursal)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{SUCURSALES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Rol</Label>
                  <Select value={nuRol} onValueChange={(value) => setNuRol(value as Role)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <Button className="mt-3" onClick={crearUsuario} disabled={busy}>
                {busy ? "Creando..." : "Crear usuario"}
              </Button>
            </Card>
          )}

          <Card className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Técnico</TableHead>
                  <TableHead>Acceso</TableHead>
                  <TableHead>Sucursal</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Activo</TableHead>
                  {isSuperAdmin && <TableHead className="w-[120px]">Acciones</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {profiles.map((profile) => (
                  <TableRow key={profile.id}>
                    <TableCell className="font-medium">{profile.nombre}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {profile.auth_user_id ? emailByProfile(profile) || "Cuenta asociada" : "Sin acceso"}
                    </TableCell>
                    <TableCell>
                      {isSuperAdmin ? (
                        <Select value={profile.sucursal ?? ""} onValueChange={(value) => cambiarSucursal(profile.id, value as Sucursal)}>
                          <SelectTrigger className="h-8 w-40"><SelectValue placeholder="—" /></SelectTrigger>
                          <SelectContent>{SUCURSALES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                        </Select>
                      ) : (
                        <span className="text-xs">{profile.sucursal ?? "—"}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {isSuperAdmin ? (
                        <Select value={rolesByUser[profile.id]?.[0] ?? ""} onValueChange={(value) => cambiarRol(profile.id, value as Role)}>
                          <SelectTrigger className="h-8 w-40"><SelectValue placeholder="—" /></SelectTrigger>
                          <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}</SelectContent>
                        </Select>
                      ) : (
                        <Badge variant="outline">{ROLE_LABELS[rolesByUser[profile.id]?.[0] as Role] ?? "—"}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {isSuperAdmin ? (
                        <Button variant={profile.activo ? "default" : "outline"} size="sm" onClick={() => toggleActivo(profile)}>
                          {profile.activo ? "Activo" : "Inactivo"}
                        </Button>
                      ) : (
                        <Badge variant={profile.activo ? "default" : "outline"}>{profile.activo ? "Activo" : "Inactivo"}</Badge>
                      )}
                    </TableCell>
                    {isSuperAdmin && (
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="outline" size="sm" onClick={() => openCred(profile)} title="Credenciales">
                            <KeyRound className="h-3.5 w-3.5" />
                          </Button>
                          {profile.auth_user_id && (
                            <Button variant="outline" size="sm" onClick={() => setDelUser(profile)} title="Quitar acceso" className="text-destructive hover:text-destructive">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          <div className="space-y-2 md:hidden">
            {profiles.map((profile) => (
              <Card key={profile.id} className="space-y-2 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{profile.nombre}</div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {profile.auth_user_id ? emailByProfile(profile) || "Cuenta asociada" : "Sin acceso"}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    {isSuperAdmin && (
                      <>
                        <Button variant="outline" size="sm" onClick={() => openCred(profile)} className="h-7 px-2">
                          <KeyRound className="h-3.5 w-3.5" />
                        </Button>
                        {profile.auth_user_id && (
                          <Button variant="outline" size="sm" onClick={() => setDelUser(profile)} className="h-7 px-2 text-destructive hover:text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button
                          variant={profile.activo ? "default" : "outline"}
                          size="sm"
                          onClick={() => toggleActivo(profile)}
                          className="h-7 px-2 text-[10px]"
                        >
                          {profile.activo ? "Activo" : "Inactivo"}
                        </Button>
                      </>
                    )}
                    {!isSuperAdmin && (
                      <Badge variant={profile.activo ? "default" : "outline"} className="text-[10px]">
                        {profile.activo ? "Activo" : "Inactivo"}
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Sucursal</Label>
                    {isSuperAdmin ? (
                      <Select value={profile.sucursal ?? ""} onValueChange={(value) => cambiarSucursal(profile.id, value as Sucursal)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>{SUCURSALES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                      </Select>
                    ) : (
                      <div className="py-1.5 text-xs">{profile.sucursal ?? "—"}</div>
                    )}
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Rol</Label>
                    {isSuperAdmin ? (
                      <Select value={rolesByUser[profile.id]?.[0] ?? ""} onValueChange={(value) => cambiarRol(profile.id, value as Role)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}</SelectContent>
                      </Select>
                    ) : (
                      <div className="py-1.5 text-xs">{ROLE_LABELS[rolesByUser[profile.id]?.[0] as Role] ?? "—"}</div>
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
                <Select value={cliSucursal || "none"} onValueChange={(value) => setCliSucursal(value === "none" ? "" : (value as Sucursal))}>
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
                {clientes.map((cliente) => (
                  <TableRow key={cliente.id}>
                    <TableCell className="font-medium">{cliente.nombre}</TableCell>
                    <TableCell>{cliente.sucursal ? <Badge variant="outline">{cliente.sucursal}</Badge> : <span className="text-muted-foreground">—</span>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!credUser} onOpenChange={(open) => !open && setCredUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{credUser?.auth_user_id ? "Editar acceso" : "Agregar acceso"} — {credUser?.nombre}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Email</Label>
              <Input type="email" value={credEmail} onChange={(e) => setCredEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{credUser?.auth_user_id ? "Nueva contraseña" : "Contraseña inicial"}</Label>
              <Input
                type="text"
                value={credPassword}
                onChange={(e) => setCredPassword(e.target.value)}
                placeholder={credUser?.auth_user_id ? "Dejar vacío para no cambiar" : "Obligatoria para crear el acceso"}
              />
              <p className="text-[11px] text-muted-foreground">Mínimo 6 caracteres.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCredUser(null)}>Cancelar</Button>
            <Button onClick={guardarCred} disabled={credBusy}>{credBusy ? "Guardando..." : "Guardar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!delUser} onOpenChange={(open) => !open && setDelUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Quitar acceso</AlertDialogTitle>
            <AlertDialogDescription>
              Vas a eliminar el acceso de <span className="font-semibold">{delUser?.nombre}</span>, pero el técnico seguirá existiendo para asignaciones y jornadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={delBusy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); eliminarUsuario(); }}
              disabled={delBusy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {delBusy ? "Quitando..." : "Quitar acceso"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
