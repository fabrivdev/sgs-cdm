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
import { Checkbox } from "@/components/ui/checkbox";
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
import { pageShell, pageTitle } from "@/lib/ui-classes";

type LoginMode = "email" | "username";
type AccessMode = "none" | LoginMode;

interface Profile {
  id: string;
  nombre: string;
  sucursal: Sucursal | null;
  activo: boolean;
  username: string | null;
  login_mode: LoginMode;
  has_login_access: boolean;
  must_change_password: boolean;
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

const profileAccessMode = (profile: Profile): AccessMode =>
  profile.has_login_access ? profile.login_mode : "none";

export default function Admin() {
  const { isSuperAdmin } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [emails, setEmails] = useState<Record<string, string>>({});

  const [accessMode, setAccessMode] = useState<AccessMode>("email");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [nombre, setNombre] = useState("");
  const [nuSucursal, setNuSucursal] = useState<Sucursal>(SUCURSALES[0]);
  const [nuRol, setNuRol] = useState<Role>("tecnico");
  const [mustChangePassword, setMustChangePassword] = useState(true);
  const [busy, setBusy] = useState(false);

  const [cliNombre, setCliNombre] = useState("");
  const [cliSucursal, setCliSucursal] = useState<Sucursal | "">("");

  const [credUser, setCredUser] = useState<Profile | null>(null);
  const [credAccessMode, setCredAccessMode] = useState<AccessMode>("email");
  const [credEmail, setCredEmail] = useState("");
  const [credUsername, setCredUsername] = useState("");
  const [credPassword, setCredPassword] = useState("");
  const [credMustChangePassword, setCredMustChangePassword] = useState(false);
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

  const accessLabel = (profile: Profile) => {
    if (!profile.has_login_access) return "Sin acceso";
    if (profile.login_mode === "username") {
      return profile.username ? `Usuario: ${profile.username}` : "Usuario pendiente";
    }
    return emails[profile.id] ? `Correo: ${emails[profile.id]}` : "Correo pendiente";
  };

  const load = async () => {
    const [{ data: prof }, { data: roleRows }, { data: cli }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, nombre, sucursal, activo, username, login_mode, has_login_access, must_change_password")
        .order("nombre"),
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

  const resetCreateForm = () => {
    setAccessMode("email");
    setEmail("");
    setUsername("");
    setPassword("");
    setNombre("");
    setNuSucursal(SUCURSALES[0]);
    setNuRol("tecnico");
    setMustChangePassword(true);
  };

  const crearUsuario = async () => {
    if (!nombre.trim()) {
      toast.error("El nombre es obligatorio");
      return;
    }

    if (accessMode !== "none" && !password.trim()) {
      toast.error("La contraseña temporal es obligatoria");
      return;
    }

    if (accessMode === "email" && !email.trim()) {
      toast.error("Indica el correo de acceso");
      return;
    }

    if (accessMode === "username" && !username.trim()) {
      toast.error("Indica el usuario de acceso");
      return;
    }

    setBusy(true);
    const { data, error } = await supabase.functions.invoke("admin-create-user", {
      body: {
        email: email.trim(),
        username: username.trim(),
        password,
        nombre: nombre.trim(),
        sucursal: nuSucursal,
        role: nuRol,
        login_mode: accessMode === "username" ? "username" : "email",
        has_login_access: accessMode !== "none",
        must_change_password: accessMode !== "none" ? mustChangePassword : false,
      },
    });
    setBusy(false);

    if (error || data?.error) {
      toast.error(error?.message || data?.error);
      return;
    }

    toast.success(accessMode === "none" ? "Tecnico creado sin acceso" : "Usuario creado");
    resetCreateForm();
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
    setCredAccessMode(profileAccessMode(profile));
    setCredEmail(emails[profile.id] ?? "");
    setCredUsername(profile.username ?? "");
    setCredPassword("");
    setCredMustChangePassword(profile.must_change_password);
  };

  const guardarCred = async () => {
    if (!credUser) return;

    if (credAccessMode !== "none" && !credPassword.trim() && !credMustChangePassword && credUser.must_change_password) {
      // no-op protection handled below
    }

    if (credAccessMode === "email" && !credEmail.trim()) {
      toast.error("Indica el correo de acceso");
      return;
    }

    if (credAccessMode === "username" && !credUsername.trim()) {
      toast.error("Indica el usuario de acceso");
      return;
    }

    const payload: {
      user_id: string;
      email?: string;
      username?: string | null;
      password?: string;
      login_mode?: LoginMode;
      has_login_access?: boolean;
      must_change_password?: boolean;
    } = { user_id: credUser.id };

    const originalAccessMode = profileAccessMode(credUser);
    const originalEmail = emails[credUser.id] ?? "";

    if (credAccessMode !== originalAccessMode) {
      payload.has_login_access = credAccessMode !== "none";
      if (credAccessMode !== "none") {
        payload.login_mode = credAccessMode;
      }
    }

    if (credAccessMode === "email") {
      if (credEmail.trim() !== originalEmail) payload.email = credEmail.trim();
      if (credUser.username) payload.username = null;
    }

    if (credAccessMode === "username") {
      if (credUsername.trim() !== (credUser.username ?? "")) payload.username = credUsername.trim();
      if (credUser.login_mode !== "username") payload.login_mode = "username";
    }

    if (credAccessMode === "none" && credUser.username) {
      payload.username = null;
    }

    if (credPassword.trim()) payload.password = credPassword;

    const nextMustChange = credAccessMode === "none" ? false : credPassword.trim() ? true : credMustChangePassword;
    if (nextMustChange !== credUser.must_change_password || !!credPassword.trim()) {
      payload.must_change_password = nextMustChange;
    }

    if (
      payload.email === undefined &&
      payload.username === undefined &&
      payload.password === undefined &&
      payload.login_mode === undefined &&
      payload.has_login_access === undefined &&
      payload.must_change_password === undefined
    ) {
      toast.info("No hay cambios");
      return;
    }

    setCredBusy(true);
    const { data, error } = await supabase.functions.invoke("admin-update-user", { body: payload });
    setCredBusy(false);

    if (error || data?.error) {
      toast.error(error?.message || data?.error);
      return;
    }

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
    if (error || data?.error) {
      toast.error(error?.message || data?.error);
      return;
    }
    toast.success("Usuario eliminado");
    setDelUser(null);
    load();
  };

  return (
    <div className={pageShell}>
      <h1 className={pageTitle}>Administracion</h1>

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
                  Solo el super administrador puede crear usuarios o modificar credenciales, roles y sucursales.
                </div>
              </div>
            </Card>
          )}

          {isSuperAdmin && (
            <Card className="p-3 sm:p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <UserPlus className="h-4 w-4" />
                Crear tecnico o usuario
              </h3>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                <div>
                  <Label className="text-xs">Nombre</Label>
                  <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
                </div>

                <div>
                  <Label className="text-xs">Acceso</Label>
                  <Select value={accessMode} onValueChange={(value) => setAccessMode(value as AccessMode)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin acceso</SelectItem>
                      <SelectItem value="email">Correo</SelectItem>
                      <SelectItem value="username">Usuario</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs">
                    {accessMode === "email" ? "Correo de acceso" : accessMode === "username" ? "Usuario de acceso" : "Sin credencial"}
                  </Label>
                  <Input
                    type={accessMode === "email" ? "email" : "text"}
                    value={accessMode === "email" ? email : accessMode === "username" ? username : ""}
                    onChange={(e) => {
                      if (accessMode === "email") setEmail(e.target.value);
                      if (accessMode === "username") setUsername(e.target.value);
                    }}
                    disabled={accessMode === "none"}
                    placeholder={accessMode === "none" ? "Solo se crea el tecnico" : ""}
                  />
                </div>

                <div>
                  <Label className="text-xs">Contrasena temporal</Label>
                  <Input
                    type="text"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={accessMode === "none"}
                    placeholder={accessMode === "none" ? "No aplica" : ""}
                  />
                </div>

                <div>
                  <Label className="text-xs">Sucursal</Label>
                  <Select value={nuSucursal} onValueChange={(value) => setNuSucursal(value as Sucursal)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SUCURSALES.map((sucursal) => (
                        <SelectItem key={sucursal} value={sucursal}>
                          {sucursal}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs">Rol</Label>
                  <Select value={nuRol} onValueChange={(value) => setNuRol(value as Role)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((role) => (
                        <SelectItem key={role} value={role}>
                          {ROLE_LABELS[role]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <label className="mt-3 flex items-center gap-2 text-xs">
                <Checkbox
                  checked={mustChangePassword}
                  onCheckedChange={(value) => setMustChangePassword(!!value)}
                  disabled={accessMode === "none"}
                />
                Pedir cambio de contrasena en el primer ingreso
              </label>

              <Button className="mt-3" onClick={crearUsuario} disabled={busy}>
                {busy ? "Creando..." : accessMode === "none" ? "Crear tecnico" : "Crear usuario"}
              </Button>
            </Card>
          )}

          <Card className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Acceso</TableHead>
                  <TableHead>Sucursal</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Activo</TableHead>
                  {isSuperAdmin && <TableHead className="w-[100px]">Acciones</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {profiles.map((profile) => (
                  <TableRow key={profile.id}>
                    <TableCell className="font-medium">{profile.nombre}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{accessLabel(profile)}</TableCell>
                    <TableCell>
                      {isSuperAdmin ? (
                        <Select value={profile.sucursal ?? ""} onValueChange={(value) => cambiarSucursal(profile.id, value as Sucursal)}>
                          <SelectTrigger className="h-8 w-40">
                            <SelectValue placeholder="-" />
                          </SelectTrigger>
                          <SelectContent>
                            {SUCURSALES.map((sucursal) => (
                              <SelectItem key={sucursal} value={sucursal}>
                                {sucursal}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-xs">{profile.sucursal ?? "-"}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {isSuperAdmin ? (
                        <Select value={rolesByUser[profile.id]?.[0] ?? ""} onValueChange={(value) => cambiarRol(profile.id, value as Role)}>
                          <SelectTrigger className="h-8 w-40">
                            <SelectValue placeholder="-" />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLES.map((role) => (
                              <SelectItem key={role} value={role}>
                                {ROLE_LABELS[role]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant="outline">{ROLE_LABELS[rolesByUser[profile.id]?.[0] as Role] ?? "-"}</Badge>
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
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setDelUser(profile)}
                            title="Eliminar usuario"
                            className="text-destructive hover:text-destructive"
                          >
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

          <div className="space-y-2 md:hidden">
            {profiles.map((profile) => (
              <Card key={profile.id} className="space-y-2 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{profile.nombre}</div>
                    <div className="truncate text-[11px] text-muted-foreground">{accessLabel(profile)}</div>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    {isSuperAdmin ? (
                      <>
                        <Button variant="outline" size="sm" onClick={() => openCred(profile)} className="h-7 px-2">
                          <KeyRound className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setDelUser(profile)}
                          className="h-7 px-2 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant={profile.activo ? "default" : "outline"}
                          size="sm"
                          onClick={() => toggleActivo(profile)}
                          className="h-7 px-2 text-[10px]"
                        >
                          {profile.activo ? "Activo" : "Inactivo"}
                        </Button>
                      </>
                    ) : (
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
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="-" />
                        </SelectTrigger>
                        <SelectContent>
                          {SUCURSALES.map((sucursal) => (
                            <SelectItem key={sucursal} value={sucursal}>
                              {sucursal}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="py-1.5 text-xs">{profile.sucursal ?? "-"}</div>
                    )}
                  </div>

                  <div>
                    <Label className="text-[10px] text-muted-foreground">Rol</Label>
                    {isSuperAdmin ? (
                      <Select value={rolesByUser[profile.id]?.[0] ?? ""} onValueChange={(value) => cambiarRol(profile.id, value as Role)}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="-" />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLES.map((role) => (
                            <SelectItem key={role} value={role}>
                              {ROLE_LABELS[role]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="py-1.5 text-xs">{ROLE_LABELS[rolesByUser[profile.id]?.[0] as Role] ?? "-"}</div>
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
              <div>
                <Label className="text-xs">Nombre</Label>
                <Input value={cliNombre} onChange={(e) => setCliNombre(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Sucursal principal (opcional)</Label>
                <Select value={cliSucursal || "none"} onValueChange={(value) => setCliSucursal(value === "none" ? "" : (value as Sucursal))}>
                  <SelectTrigger>
                    <SelectValue placeholder="-" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">- Ninguna -</SelectItem>
                    {SUCURSALES.map((sucursal) => (
                      <SelectItem key={sucursal} value={sucursal}>
                        {sucursal}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button onClick={crearCliente}>Agregar</Button>
              </div>
            </div>
          </Card>

          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Sucursal principal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clientes.map((cliente) => (
                  <TableRow key={cliente.id}>
                    <TableCell className="font-medium">{cliente.nombre}</TableCell>
                    <TableCell>
                      {cliente.sucursal ? <Badge variant="outline">{cliente.sucursal}</Badge> : <span className="text-muted-foreground">-</span>}
                    </TableCell>
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
            <DialogTitle>Acceso - {credUser?.nombre}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Acceso</Label>
              <Select value={credAccessMode} onValueChange={(value) => setCredAccessMode(value as AccessMode)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin acceso</SelectItem>
                  <SelectItem value="email">Correo</SelectItem>
                  <SelectItem value="username">Usuario</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">
                {credAccessMode === "email" ? "Correo de acceso" : credAccessMode === "username" ? "Usuario de acceso" : "Sin credencial"}
              </Label>
              <Input
                type={credAccessMode === "email" ? "email" : "text"}
                value={credAccessMode === "email" ? credEmail : credAccessMode === "username" ? credUsername : ""}
                onChange={(e) => {
                  if (credAccessMode === "email") setCredEmail(e.target.value);
                  if (credAccessMode === "username") setCredUsername(e.target.value);
                }}
                disabled={credAccessMode === "none"}
                placeholder={credAccessMode === "none" ? "No podra ingresar a la app" : ""}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Nueva contrasena</Label>
              <Input
                type="text"
                value={credPassword}
                onChange={(e) => setCredPassword(e.target.value)}
                placeholder="Dejar vacio para no cambiar"
                disabled={credAccessMode === "none"}
              />
              <p className="text-[11px] text-muted-foreground">Minimo 6 caracteres si la cambias.</p>
            </div>

            <label className="flex items-center gap-2 text-xs">
              <Checkbox
                checked={credMustChangePassword}
                onCheckedChange={(value) => setCredMustChangePassword(!!value)}
                disabled={credAccessMode === "none"}
              />
              Pedir cambio de contrasena en el proximo ingreso
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCredUser(null)}>
              Cancelar
            </Button>
            <Button onClick={guardarCred} disabled={credBusy}>
              {credBusy ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!delUser} onOpenChange={(open) => !open && setDelUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar usuario</AlertDialogTitle>
            <AlertDialogDescription>
              Vas a eliminar definitivamente a <span className="font-semibold">{delUser?.nombre}</span>. Esta accion no se puede deshacer y borra su acceso, perfil y roles.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={delBusy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                eliminarUsuario();
              }}
              disabled={delBusy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {delBusy ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
