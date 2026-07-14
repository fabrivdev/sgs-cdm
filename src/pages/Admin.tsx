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
import { Database, Eye, EyeOff, KeyRound, ShieldAlert, Trash2, UserPlus, Users } from "lucide-react";
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
import { ImportarTab } from "@/components/parque/ImportarTab";

interface Profile {
  id: string;
  auth_user_id?: string | null;
  nombre: string;
  sucursal: Sucursal | null;
  activo: boolean;
}

interface UserRole {
  user_id: string;
  role: Role;
}

export default function Admin() {
  const { isSuperAdmin } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [emails, setEmails] = useState<Record<string, string>>({});

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nombre, setNombre] = useState("");
  const [nuSucursal, setNuSucursal] = useState<Sucursal>(SUCURSALES[0]);
  const [nuRol, setNuRol] = useState<Role>("tecnico");
  const [busy, setBusy] = useState(false);

  const [credUser, setCredUser] = useState<Profile | null>(null);
  const [credEmail, setCredEmail] = useState("");
  const [credPassword, setCredPassword] = useState("");
  const [credBusy, setCredBusy] = useState(false);

  const [delUser, setDelUser] = useState<Profile | null>(null);
  const [delBusy, setDelBusy] = useState(false);
  const [toggleActivoPending, setToggleActivoPending] = useState<Profile | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showCredPassword, setShowCredPassword] = useState(false);

  const rolesByUser = useMemo(
    () =>
      roles.reduce<Record<string, Role[]>>((acc, item) => {
        (acc[item.user_id] ??= []).push(item.role);
        return acc;
      }, {}),
    [roles],
  );

  const hasLinkedSchema = profiles.some((profile) => typeof profile.auth_user_id !== "undefined");

  const emailByProfile = (profile: Profile) => {
    const linkedUserId = profile.auth_user_id || profile.id;
    return emails[linkedUserId] ?? "";
  };

  const profilesConAcceso = useMemo(
    () => profiles.filter((profile) => Boolean(emailByProfile(profile))),
    [profiles, emails],
  );
  const profilesSinAcceso = useMemo(
    () => profiles.filter((profile) => !emailByProfile(profile)),
    [profiles, emails],
  );
  const perfilesActivos = useMemo(
    () => profiles.filter((profile) => profile.activo).length,
    [profiles],
  );

  const load = async () => {
    const [profileResult, roleResult] = await Promise.all([
      (supabase as any).from("profiles").select("id, auth_user_id, nombre, sucursal, activo").order("nombre"),
      supabase.from("user_roles").select("user_id, role"),
    ]);

    let loadedProfiles = (profileResult.data ?? []) as Profile[];
    if (profileResult.error) {
      const message = profileResult.error.message ?? "";
      if (/auth_user_id/i.test(message) && /does not exist/i.test(message)) {
        const { data: legacyProfiles, error: legacyError } = await supabase
          .from("profiles")
          .select("id, nombre, sucursal, activo")
          .order("nombre");

        if (legacyError) {
          toast.error(legacyError.message);
          return;
        }

        loadedProfiles = (legacyProfiles ?? []) as Profile[];
      } else {
        toast.error(profileResult.error.message);
        return;
      }
    }

    setProfiles(loadedProfiles);
    setRoles((roleResult.data ?? []) as UserRole[]);

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
    if (profile.activo) { setToggleActivoPending(profile); return; }
    const { error } = await supabase.from("profiles").update({ activo: true }).eq("id", profile.id);
    if (error) toast.error(error.message);
    else { toast.success("Usuario reactivado"); load(); }
  };

  const confirmarToggleActivo = async () => {
    if (!toggleActivoPending) return;
    const { error } = await supabase.from("profiles").update({ activo: false }).eq("id", toggleActivoPending.id);
    if (error) toast.error(error.message);
    else { toast.success("Usuario desactivado"); load(); }
    setToggleActivoPending(null);
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

  const openCred = (profile: Profile) => {
    setCredUser(profile);
    setCredEmail(emailByProfile(profile));
    setCredPassword("");
    setShowCredPassword(false);
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

    const profileHasAccess = !!emailByProfile(credUser);

    const runner = hasLinkedSchema
      ? profileHasAccess
        ? supabase.functions.invoke("admin-update-user", {
            body: { profile_id: credUser.id, email: credEmail.trim(), password: credPassword || undefined },
          })
        : supabase.functions.invoke("admin-create-user", {
            body: {
              profile_id: credUser.id,
              email: credEmail.trim(),
              password: credPassword,
            },
          })
      : profileHasAccess
      ? supabase.functions.invoke("admin-update-user", {
          body: { user_id: credUser.id, email: credEmail.trim(), password: credPassword || undefined },
        })
      : Promise.resolve({
          data: { error: "Este entorno todavía no tiene habilitada la asociación de acceso a técnicos existentes." },
          error: null,
        });

    const { data, error } = await runner;
    setCredBusy(false);

    if (error || data?.error) {
      toast.error(error?.message || data?.error);
      return;
    }

    toast.success(profileHasAccess ? "Credenciales actualizadas" : "Acceso asociado al técnico");
    setCredUser(null);
    load();
  };

  const eliminarUsuario = async () => {
    if (!delUser) return;
    setDelBusy(true);
    const payload = hasLinkedSchema ? { profile_id: delUser.id } : { user_id: delUser.id };
    const { data, error } = await supabase.functions.invoke("admin-delete-user", { body: payload });
    setDelBusy(false);
    if (error || data?.error) {
      toast.error(error?.message || data?.error);
      return;
    }
    toast.success(hasLinkedSchema ? "Acceso eliminado. El técnico sigue existiendo." : "Usuario eliminado");
    setDelUser(null);
    load();
  };

  return (
    <div className="container max-w-6xl space-y-4 px-3 py-3 sm:py-4">
      <h1 className="text-2xl font-bold">Administración</h1>

      <Tabs defaultValue="equipo">
        <TabsList>
          <TabsTrigger value="equipo">
            <Users className="mr-2 h-4 w-4" />
            Equipo
          </TabsTrigger>
          <TabsTrigger value="accesos">
            <KeyRound className="mr-2 h-4 w-4" />
            Accesos
          </TabsTrigger>
          <TabsTrigger value="importar">
            <Database className="mr-2 h-4 w-4" />
            Importar datos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="equipo" className="space-y-4">
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

          <div className="grid gap-3 sm:grid-cols-3">
            <Card className="p-3">
              <div className="text-[11px] uppercase text-muted-foreground">Perfiles operativos</div>
              <div className="mt-1 text-2xl font-semibold">{profiles.length}</div>
              <div className="text-xs text-muted-foreground">{perfilesActivos} activos</div>
            </Card>
            <Card className="p-3">
              <div className="text-[11px] uppercase text-muted-foreground">Con acceso</div>
              <div className="mt-1 text-2xl font-semibold">{profilesConAcceso.length}</div>
              <div className="text-xs text-muted-foreground">Pueden iniciar sesion</div>
            </Card>
            <Card className="p-3">
              <div className="text-[11px] uppercase text-muted-foreground">Sin acceso</div>
              <div className="mt-1 text-2xl font-semibold">{profilesSinAcceso.length}</div>
              <div className="text-xs text-muted-foreground">Solo equipo operativo</div>
            </Card>
          </div>

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
                      {emailByProfile(profile) || "Sin acceso"}
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
                          {emailByProfile(profile) && (
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
                      {emailByProfile(profile) || "Sin acceso"}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    {isSuperAdmin && (
                      <>
                        <Button variant="outline" size="sm" onClick={() => openCred(profile)} className="h-9 w-9 px-0">
                          <KeyRound className="h-4 w-4" />
                        </Button>
                        {emailByProfile(profile) && (
                          <Button variant="outline" size="sm" onClick={() => setDelUser(profile)} className="h-9 w-9 px-0 text-destructive hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant={profile.activo ? "default" : "outline"}
                          size="sm"
                          onClick={() => toggleActivo(profile)}
                          className="h-9 px-3 text-xs"
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

        <TabsContent value="accesos" className="space-y-4">
          {!isSuperAdmin && (
            <Card className="flex items-start gap-3 border-amber-500/40 bg-amber-500/5 p-3 sm:p-4">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div className="text-xs">
                <div className="font-semibold text-amber-700">Solo lectura</div>
                <div className="text-muted-foreground">Solo el super administrador puede crear, editar o quitar accesos.</div>
              </div>
            </Card>
          )}

          {isSuperAdmin && (
            <Card className="p-3 sm:p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <UserPlus className="h-4 w-4" />
                Crear acceso nuevo
              </h3>
              <p className="mb-3 text-xs text-muted-foreground">
                Usalo solo para una persona que todavia no existe en Equipo. Para tecnicos ya cargados, usa Crear acceso en la lista inferior.
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
                  <Label className="text-xs">Contrasena</Label>
                  <div className="relative">
                    <Input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} className="pr-9" />
                    <button type="button" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? "Ocultar contrasena" : "Mostrar contrasena"}>
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
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
              <Button className="mt-3" onClick={crearUsuario} disabled={busy}>{busy ? "Creando..." : "Crear acceso"}</Button>
            </Card>
          )}

          <Card className="p-3 sm:p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold">Accesos activos</div>
                <div className="text-xs text-muted-foreground">Personas con email asociado para iniciar sesion.</div>
              </div>
              <Badge variant="outline">{profilesConAcceso.length} accesos</Badge>
            </div>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Persona</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead>Sucursal</TableHead>
                    <TableHead>Estado</TableHead>
                    {isSuperAdmin && <TableHead className="w-[120px]">Acciones</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {profilesConAcceso.map((profile) => (
                    <TableRow key={profile.id}>
                      <TableCell className="font-medium">{profile.nombre}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{emailByProfile(profile)}</TableCell>
                      <TableCell><Badge variant="outline">{ROLE_LABELS[rolesByUser[profile.id]?.[0] as Role] ?? "-"}</Badge></TableCell>
                      <TableCell className="text-xs">{profile.sucursal ?? "-"}</TableCell>
                      <TableCell><Badge variant={profile.activo ? "default" : "outline"}>{profile.activo ? "Activo" : "Inactivo"}</Badge></TableCell>
                      {isSuperAdmin && (
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="outline" size="sm" onClick={() => openCred(profile)} title="Editar acceso"><KeyRound className="h-3.5 w-3.5" /></Button>
                            <Button variant="outline" size="sm" onClick={() => setDelUser(profile)} title="Quitar acceso" className="text-destructive hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>

          <Card className="p-3 sm:p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold">Equipo sin acceso</div>
                <div className="text-xs text-muted-foreground">Siguen disponibles para planificador, calendario y jornadas, pero no pueden iniciar sesion.</div>
              </div>
              <Badge variant="outline">{profilesSinAcceso.length} perfiles</Badge>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {profilesSinAcceso.slice(0, 12).map((profile) => (
                <div key={profile.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{profile.nombre}</div>
                    <div className="truncate text-xs text-muted-foreground">{profile.sucursal ?? "Sin sucursal"} - {ROLE_LABELS[rolesByUser[profile.id]?.[0] as Role] ?? "Sin rol"}</div>
                  </div>
                  {isSuperAdmin && <Button variant="outline" size="sm" className="shrink-0" onClick={() => openCred(profile)}>Crear acceso</Button>}
                </div>
              ))}
              {profilesSinAcceso.length > 12 && (
                <div className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">+{profilesSinAcceso.length - 12} perfiles sin acceso. Buscalos en Equipo para asociarlos.</div>
              )}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="importar" className="space-y-4">
          <ImportarTab onChanged={load} />
        </TabsContent>
      </Tabs>

      <Dialog open={!!credUser} onOpenChange={(open) => !open && setCredUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{credUser && emailByProfile(credUser) ? "Editar acceso" : "Agregar acceso"} — {credUser?.nombre}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Email</Label>
              <Input type="email" value={credEmail} onChange={(e) => setCredEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{credUser && emailByProfile(credUser) ? "Nueva contraseña" : "Contraseña inicial"}</Label>
              <div className="relative">
                <Input
                  type={showCredPassword ? "text" : "password"}
                  value={credPassword}
                  onChange={(e) => setCredPassword(e.target.value)}
                  placeholder={credUser && emailByProfile(credUser) ? "Dejar vacío para no cambiar" : "Obligatoria para crear el acceso"}
                  className="pr-9"
                />
                <button
                  type="button"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowCredPassword((v) => !v)}
                  aria-label={showCredPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  {showCredPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground">Mínimo 6 caracteres.</p>
            </div>
            {!hasLinkedSchema && !(credUser && emailByProfile(credUser)) && (
              <p className="text-[11px] text-amber-700">
                Este proyecto publicado todavía no tiene desplegada la migración que permite vincular una cuenta nueva a un técnico ya existente.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCredUser(null)}>Cancelar</Button>
            <Button onClick={guardarCred} disabled={credBusy}>{credBusy ? "Guardando..." : "Guardar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toggleActivoPending} onOpenChange={(open) => !open && setToggleActivoPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desactivar usuario?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-semibold">{toggleActivoPending?.nombre}</span> perderá acceso al sistema de inmediato. Podés reactivarlo en cualquier momento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); confirmarToggleActivo(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Desactivar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
