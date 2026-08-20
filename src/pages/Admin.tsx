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
import { MODULOS, MODULO_LABELS, ROLES, ROLE_LABELS, SUCURSALES, nivelLabel, type AssignableRole, type Modulo, type Role, type Sucursal } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ChevronDown, Database, Eye, EyeOff, KeyRound, Save, Settings2, ShieldAlert, Trash2, UserPlus, Users } from "lucide-react";
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
import { ImportarTotvsTab } from "@/components/parque/ImportarTotvsTab";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { KpiItem, KpiStrip, PageHeader, PageShell } from "@/components/layout/AppPrimitives";
import { DEFAULT_MONTHLY_PRODUCTIVITY_GOAL, loadMonthlyProductivityGoal, saveMonthlyProductivityGoal } from "@/lib/appSettings";

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

interface UserModuloAcceso {
  user_id: string;
  modulo_id: Modulo;
}

function ModuloChips({
  activos,
  editable,
  onToggle,
}: {
  activos: Modulo[];
  editable: boolean;
  onToggle: (modulo: Modulo, activo: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {MODULOS.map((modulo) => {
        const checked = activos.includes(modulo);
        return (
          <button
            key={modulo}
            type="button"
            disabled={!editable}
            onClick={() => onToggle(modulo, !checked)}
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors",
              checked
                ? "border-primary bg-primary text-primary-foreground"
                : "border-muted-foreground/25 text-muted-foreground",
              editable && !checked && "hover:border-muted-foreground/50 hover:text-foreground",
              !editable && "cursor-default",
            )}
          >
            {MODULO_LABELS[modulo]}
          </button>
        );
      })}
    </div>
  );
}

export default function Admin() {
  const { can } = useAuth();
  const canManageAdmin = can("administracion:gestionar");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [moduloAcceso, setModuloAcceso] = useState<UserModuloAcceso[]>([]);
  const [emails, setEmails] = useState<Record<string, string>>({});

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nombre, setNombre] = useState("");
  const [nuSucursal, setNuSucursal] = useState<Sucursal>(SUCURSALES[0]);
  const [nuRol, setNuRol] = useState<AssignableRole>("operativo");
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
  const [monthlyProductivityGoal, setMonthlyProductivityGoal] = useState(DEFAULT_MONTHLY_PRODUCTIVITY_GOAL);
  const [savingParameters, setSavingParameters] = useState(false);

  const rolesByUser = useMemo(
    () =>
      roles.reduce<Record<string, Role[]>>((acc, item) => {
        (acc[item.user_id] ??= []).push(item.role);
        return acc;
      }, {}),
    [roles],
  );

  const moduloAccesoByUser = useMemo(
    () =>
      moduloAcceso.reduce<Record<string, Modulo[]>>((acc, item) => {
        (acc[item.user_id] ??= []).push(item.modulo_id);
        return acc;
      }, {}),
    [moduloAcceso],
  );

  const hasLinkedSchema = profiles.some((profile) => typeof profile.auth_user_id !== "undefined");

  const emailByProfile = (profile: Profile) => {
    const linkedUserId = profile.auth_user_id || profile.id;
    return emails[linkedUserId] ?? "";
  };

  const permissionOwnerId = (profile: Profile) => profile.auth_user_id || profile.id;
  const rolesForProfile = (profile: Profile) => Array.from(new Set([
    ...(rolesByUser[permissionOwnerId(profile)] ?? []),
    ...(rolesByUser[profile.id] ?? []),
  ]));
  const primaryRoleForProfile = (profile: Profile): Role | undefined => {
    const profileRoles = rolesForProfile(profile);
    return profileRoles.includes("superadmin")
      ? "superadmin"
      : profileRoles[0];
  };
  const isProtectedProfile = (profile: Profile) => rolesForProfile(profile).includes("superadmin");
  const modulesForProfile = (profile: Profile) => Array.from(new Set([
    ...(moduloAccesoByUser[permissionOwnerId(profile)] ?? []),
    ...(moduloAccesoByUser[profile.id] ?? []),
  ]));

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
    const [profileResult, roleResult, moduloAccesoResult] = await Promise.all([
      (supabase as any).from("profiles").select("id, auth_user_id, nombre, sucursal, activo").order("nombre"),
      supabase.from("user_roles").select("user_id, role"),
      (supabase as any).from("user_modulo_acceso").select("user_id, modulo_id"),
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
    setModuloAcceso((moduloAccesoResult.data ?? []) as UserModuloAcceso[]);

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
    loadMonthlyProductivityGoal().then(setMonthlyProductivityGoal);
  }, []);

  const saveParameters = async () => {
    if (!Number.isFinite(monthlyProductivityGoal) || monthlyProductivityGoal <= 0) {
      toast.error("La meta mensual debe ser mayor que cero");
      return;
    }
    setSavingParameters(true);
    try {
      await saveMonthlyProductivityGoal(monthlyProductivityGoal);
      toast.success("Parámetros guardados");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudieron guardar los parámetros");
    } finally {
      setSavingParameters(false);
    }
  };

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

  const updateProfileActive = async (id: string, activo: boolean) => {
    const payload = {
      activo,
      desactivado_en: activo ? null : new Date().toISOString(),
    };
    const primary = await (supabase as any).from("profiles").update(payload).eq("id", id);
    const message = primary.error?.message ?? "";

    if (
      primary.error &&
      /desactivado_en/i.test(message) &&
      /(does not exist|schema cache)/i.test(message)
    ) {
      return supabase.from("profiles").update({ activo }).eq("id", id);
    }

    return primary;
  };

  const toggleActivo = async (profile: Profile) => {
    if (isProtectedProfile(profile)) {
      toast.error("El superadministrador está protegido");
      return;
    }
    if (profile.activo) { setToggleActivoPending(profile); return; }
    const { error } = await updateProfileActive(profile.id, true);
    if (error) toast.error(error.message);
    else { toast.success("Usuario reactivado"); load(); }
  };

  const confirmarToggleActivo = async () => {
    if (!toggleActivoPending) return;
    if (isProtectedProfile(toggleActivoPending)) {
      toast.error("El superadministrador está protegido");
      setToggleActivoPending(null);
      return;
    }
    const { error } = await updateProfileActive(toggleActivoPending.id, false);
    if (error) toast.error(error.message);
    else { toast.success("Usuario desactivado"); load(); }
    setToggleActivoPending(null);
  };

  const cambiarRol = async (userId: string, role: AssignableRole) => {
    if ((rolesByUser[userId] ?? []).includes("superadmin")) {
      toast.error("El rol del superadministrador está protegido");
      return;
    }
    await supabase.from("user_roles").delete().eq("user_id", userId);
    const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
    if (error) toast.error(error.message);
    else {
      toast.success("Rol actualizado");
      load();
    }
  };

  const cambiarModuloAcceso = async (userId: string, moduloId: Modulo, activo: boolean) => {
    if ((rolesByUser[userId] ?? []).includes("superadmin")) {
      toast.error("Los accesos del superadministrador están protegidos");
      return;
    }
    const query = activo
      ? (supabase as any).from("user_modulo_acceso").insert({ user_id: userId, modulo_id: moduloId })
      : (supabase as any).from("user_modulo_acceso").delete().eq("user_id", userId).eq("modulo_id", moduloId);
    const { error } = await query;
    if (error) toast.error(error.message);
    else load();
  };

  const cambiarSucursal = async (id: string, sucursal: Sucursal) => {
    const target = profiles.find((profile) => profile.id === id);
    if (target && isProtectedProfile(target)) {
      toast.error("El perfil del superadministrador está protegido");
      return;
    }
    const { error } = await supabase.from("profiles").update({ sucursal }).eq("id", id);
    if (error) toast.error(error.message);
    else load();
  };

  const openCred = (profile: Profile) => {
    if (isProtectedProfile(profile)) {
      toast.error("Las credenciales del superadministrador están protegidas");
      return;
    }
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
    if (isProtectedProfile(delUser)) {
      toast.error("El acceso del superadministrador está protegido");
      setDelUser(null);
      return;
    }
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
    <PageShell>
      <PageHeader title="Administración" />

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
          <TabsTrigger value="parametros">
            <Settings2 className="mr-2 h-4 w-4" />
            Parámetros
          </TabsTrigger>
        </TabsList>

        <TabsContent value="equipo" className="space-y-4">
          {!canManageAdmin && (
            <Card className="flex items-start gap-3 border-amber-500/40 bg-amber-500/5 p-3 sm:p-4">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div className="text-[12px]">
                <div className="font-semibold text-amber-700">Solo lectura</div>
                <div className="text-muted-foreground">
                  Únicamente el super administrador puede crear usuarios o modificar credenciales, roles y sucursales.
                </div>
              </div>
            </Card>
          )}

          <KpiStrip className="sm:grid-cols-3">
            <KpiItem label="Perfiles operativos" value={profiles.length} detail={`${perfilesActivos} activos`} />
            <KpiItem label="Con acceso" value={profilesConAcceso.length} detail="Pueden iniciar sesión" tone="positive" />
            <KpiItem label="Sin acceso" value={profilesSinAcceso.length} detail="Solo equipo operativo" tone="warning" />
          </KpiStrip>

          <Card className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Técnico</TableHead>
                  <TableHead>Acceso</TableHead>
                  <TableHead>Sucursal</TableHead>
                  <TableHead>Nivel</TableHead>
                  <TableHead>Activo</TableHead>
                  {canManageAdmin && <TableHead className="w-[120px]">Acciones</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {profiles.map((profile) => (
                  <TableRow key={profile.id}>
                    <TableCell className="font-medium">{profile.nombre}</TableCell>
                    <TableCell className="text-[12px] text-muted-foreground">
                      {emailByProfile(profile) || "Sin acceso"}
                    </TableCell>
                    <TableCell>
                      {canManageAdmin && !isProtectedProfile(profile) ? (
                        <Select value={profile.sucursal ?? ""} onValueChange={(value) => cambiarSucursal(profile.id, value as Sucursal)}>
                          <SelectTrigger className="h-8 w-40"><SelectValue placeholder="—" /></SelectTrigger>
                          <SelectContent>{SUCURSALES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                        </Select>
                      ) : (
                        <span className="text-[12px]">{profile.sucursal ?? "—"}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{nivelLabel(primaryRoleForProfile(profile), modulesForProfile(profile))}</Badge>
                    </TableCell>
                    <TableCell>
                      {canManageAdmin && !isProtectedProfile(profile) ? (
                        <Button variant={profile.activo ? "default" : "outline"} size="sm" onClick={() => toggleActivo(profile)}>
                          {profile.activo ? "Activo" : "Inactivo"}
                        </Button>
                      ) : (
                        <Badge variant={profile.activo ? "default" : "outline"}>{profile.activo ? "Activo" : "Inactivo"}</Badge>
                      )}
                    </TableCell>
                    {canManageAdmin && (
                      <TableCell>
                        {isProtectedProfile(profile) ? (
                          <Badge variant="outline">Protegido</Badge>
                        ) : (
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
                        )}
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
                    {canManageAdmin && !isProtectedProfile(profile) && (
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
                          className="h-9 px-3 text-[12px]"
                        >
                          {profile.activo ? "Activo" : "Inactivo"}
                        </Button>
                      </>
                    )}
                    {(!canManageAdmin || isProtectedProfile(profile)) && (
                      <Badge variant={profile.activo ? "default" : "outline"} className="text-[10px]">
                        {profile.activo ? "Activo" : "Inactivo"}
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Sucursal</Label>
                    {canManageAdmin && !isProtectedProfile(profile) ? (
                      <Select value={profile.sucursal ?? ""} onValueChange={(value) => cambiarSucursal(profile.id, value as Sucursal)}>
                        <SelectTrigger className="h-8 text-[12px]"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>{SUCURSALES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                      </Select>
                    ) : (
                      <div className="py-1.5 text-[12px]">{profile.sucursal ?? "—"}</div>
                    )}
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Nivel</Label>
                    <div className="py-1.5 text-[12px]">{nivelLabel(primaryRoleForProfile(profile), modulesForProfile(profile))}</div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="accesos" className="space-y-4">
          {!canManageAdmin && (
            <Card className="flex items-start gap-3 border-amber-500/40 bg-amber-500/5 p-3 sm:p-4">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div className="text-[12px]">
                <div className="font-semibold text-amber-700">Solo lectura</div>
                <div className="text-muted-foreground">Solo el super administrador puede crear, editar o quitar accesos.</div>
              </div>
            </Card>
          )}

          {canManageAdmin && (
            <Card className="p-3 sm:p-4">
              <h3 className="mb-3 flex items-center gap-2 text-[13px] font-semibold">
                <UserPlus className="h-4 w-4" />
                Crear acceso nuevo
              </h3>
              <p className="mb-3 text-[12px] text-muted-foreground">
                Usalo solo para una persona que todavia no existe en Equipo. Para tecnicos ya cargados, usa Crear acceso en la lista inferior.
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <div>
                  <Label className="text-[12px]">Nombre</Label>
                  <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
                </div>
                <div>
                  <Label className="text-[12px]">Email</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div>
                  <Label className="text-[12px]">Contrasena</Label>
                  <div className="relative">
                    <Input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} className="pr-9" />
                    <button type="button" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? "Ocultar contrasena" : "Mostrar contrasena"}>
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <Label className="text-[12px]">Sucursal</Label>
                  <Select value={nuSucursal} onValueChange={(value) => setNuSucursal(value as Sucursal)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{SUCURSALES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[12px]">Rol</Label>
                  <Select value={nuRol} onValueChange={(value) => setNuRol(value as AssignableRole)}>
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
                <div className="text-[13px] font-semibold">Accesos activos</div>
                <div className="text-[12px] text-muted-foreground">Personas con email asociado para iniciar sesion.</div>
              </div>
              <Badge variant="outline">{profilesConAcceso.length} accesos</Badge>
            </div>
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Persona</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Nivel</TableHead>
                    <TableHead>Módulos</TableHead>
                    <TableHead>Sucursal</TableHead>
                    <TableHead>Estado</TableHead>
                    {canManageAdmin && <TableHead className="w-[120px]">Acciones</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {profilesConAcceso.map((profile) => (
                    <TableRow key={profile.id}>
                      <TableCell className="font-medium">{profile.nombre}</TableCell>
                      <TableCell className="text-[12px] text-muted-foreground">{emailByProfile(profile)}</TableCell>
                      <TableCell>
                        {canManageAdmin && !isProtectedProfile(profile) ? (
                          <Select value={primaryRoleForProfile(profile) ?? ""} onValueChange={(value) => cambiarRol(permissionOwnerId(profile), value as AssignableRole)}>
                            <SelectTrigger className="h-8 w-36"><SelectValue placeholder="—" /></SelectTrigger>
                            <SelectContent>{ROLES.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}</SelectContent>
                          </Select>
                        ) : (
                          <Badge variant="outline">{nivelLabel(primaryRoleForProfile(profile), modulesForProfile(profile))}</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <ModuloChips
                          activos={modulesForProfile(profile)}
                          editable={canManageAdmin && !isProtectedProfile(profile)}
                          onToggle={(modulo, activo) => cambiarModuloAcceso(permissionOwnerId(profile), modulo, activo)}
                        />
                      </TableCell>
                      <TableCell className="text-[12px]">{profile.sucursal ?? "-"}</TableCell>
                      <TableCell><Badge variant={profile.activo ? "default" : "outline"}>{profile.activo ? "Activo" : "Inactivo"}</Badge></TableCell>
                      {canManageAdmin && (
                        <TableCell>
                          {isProtectedProfile(profile) ? (
                            <Badge variant="outline">Protegido</Badge>
                          ) : (
                            <div className="flex gap-1">
                              <Button variant="outline" size="sm" onClick={() => openCred(profile)} title="Editar acceso"><KeyRound className="h-3.5 w-3.5" /></Button>
                              <Button variant="outline" size="sm" onClick={() => setDelUser(profile)} title="Quitar acceso" className="text-destructive hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                            </div>
                          )}
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
                <div className="text-[13px] font-semibold">Equipo sin acceso</div>
                <div className="text-[12px] text-muted-foreground">Siguen disponibles para planificador, calendario y jornadas, pero no pueden iniciar sesion.</div>
              </div>
              <Badge variant="outline">{profilesSinAcceso.length} perfiles</Badge>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {profilesSinAcceso.slice(0, 12).map((profile) => (
                <div key={profile.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium">{profile.nombre}</div>
                    <div className="truncate text-[12px] text-muted-foreground">{profile.sucursal ?? "Sin sucursal"} - {nivelLabel(primaryRoleForProfile(profile), modulesForProfile(profile))}</div>
                  </div>
                  {canManageAdmin && !isProtectedProfile(profile) && <Button variant="outline" size="sm" className="shrink-0" onClick={() => openCred(profile)}>Crear acceso</Button>}
                </div>
              ))}
              {profilesSinAcceso.length > 12 && (
                <div className="rounded-md border border-dashed px-3 py-2 text-[12px] text-muted-foreground">+{profilesSinAcceso.length - 12} perfiles sin acceso. Buscalos en Equipo para asociarlos.</div>
              )}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="importar" className="space-y-4">
          <ImportarTotvsTab onChanged={load} />

          <Collapsible>
            <CollapsibleTrigger className="flex w-full items-center gap-1.5 rounded-md py-1 text-[12px] font-medium text-muted-foreground hover:text-foreground [&[data-state=open]>svg]:rotate-180">
              <ChevronDown className="h-3.5 w-3.5 transition-transform" />
              Importadores anteriores e historial
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <ImportarTab onChanged={load} />
            </CollapsibleContent>
          </Collapsible>
        </TabsContent>

        <TabsContent value="parametros" className="space-y-4">
          <Card className="max-w-2xl p-4">
            <div className="mb-4">
              <h2 className="text-[13px] font-semibold leading-5">Productividad técnica</h2>
              <p className="mt-1 text-[12px] text-muted-foreground">
                Define la meta mensual usada para calcular la productividad en el Dashboard de Servicios.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,260px)_1fr] sm:items-end">
              <div className="space-y-1.5">
                <Label htmlFor="monthly-productivity-goal" className="text-[12px]">Meta mensual por técnico</Label>
                <div className="relative">
                  <Input
                    id="monthly-productivity-goal"
                    type="number"
                    min="1"
                    step="1"
                    value={monthlyProductivityGoal}
                    onChange={(event) => setMonthlyProductivityGoal(Number(event.target.value))}
                    disabled={!canManageAdmin}
                    className="pr-12"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-muted-foreground">hs</span>
                </div>
              </div>
              <div className="text-[12px] text-muted-foreground">
                Para rangos parciales, la aplicación prorratea esta meta por días calendario. Un mes completo siempre usa la meta indicada.
              </div>
            </div>
            {canManageAdmin ? (
              <Button className="mt-4" onClick={saveParameters} disabled={savingParameters}>
                <Save className="mr-2 h-4 w-4" />
                {savingParameters ? "Guardando..." : "Guardar parámetro"}
              </Button>
            ) : (
              <div className="mt-4 text-[12px] text-muted-foreground">Solo el super administrador puede modificar este parámetro.</div>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!credUser} onOpenChange={(open) => !open && setCredUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{credUser && emailByProfile(credUser) ? "Editar acceso" : "Agregar acceso"} — {credUser?.nombre}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-[12px]">Email</Label>
              <Input type="email" value={credEmail} onChange={(e) => setCredEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px]">{credUser && emailByProfile(credUser) ? "Nueva contraseña" : "Contraseña inicial"}</Label>
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
    </PageShell>
  );
}
