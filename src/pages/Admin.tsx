/* eslint-disable @typescript-eslint/no-explicit-any -- Administración consulta tablas nuevas antes de regenerar database.types. */
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { PageHeader, PageShell } from "@/components/layout/AppPrimitives";
import { DEFAULT_MONTHLY_PRODUCTIVITY_GOAL, loadMonthlyProductivityGoal, saveMonthlyProductivityGoal } from "@/lib/appSettings";
import { TableExportButton, type TableExportOption } from "@/components/exports/TableExportButton";
import { FiltersBar } from "@/components/filters/FiltersBar";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";

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

interface AppSection {
  id: string;
  modulo_id: string;
  nombre: string;
  orden: number;
}

interface UserSectionAccess {
  user_id: string;
  seccion_id: string;
}

const normalizeAdminSearch = (value: string) => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleLowerCase("es")
  .trim();

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
  const { can, isSuperAdmin, hasSectionAccess } = useAuth();
  const canManageAdmin = can("administracion:gestionar");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [moduloAcceso, setModuloAcceso] = useState<UserModuloAcceso[]>([]);
  const [sections, setSections] = useState<AppSection[]>([]);
  const [sectionAccess, setSectionAccess] = useState<UserSectionAccess[]>([]);
  const [sectionUser, setSectionUser] = useState<Profile | null>(null);
  const [sectionBusy, setSectionBusy] = useState<string | null>(null);
  const [emails, setEmails] = useState<Record<string, string>>({});

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nombre, setNombre] = useState("");
  const [nuSucursal, setNuSucursal] = useState<Sucursal>(SUCURSALES[0]);
  const [nuRol, setNuRol] = useState<AssignableRole>("operativo");
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

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
  const [adminTab, setAdminTab] = useState("equipo");
  const [tableSearch, setTableSearch] = useState("");
  const availableAdminTabs = useMemo(() => [
    hasSectionAccess("admin.usuarios") ? "equipo" : null,
    hasSectionAccess("admin.importaciones") ? "importar" : null,
    hasSectionAccess("admin.parametros") ? "parametros" : null,
  ].filter(Boolean) as string[], [hasSectionAccess]);

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

  const sectionAccessByUser = useMemo(
    () => sectionAccess.reduce<Record<string, string[]>>((acc, item) => {
      (acc[item.user_id] ??= []).push(item.seccion_id);
      return acc;
    }, {}),
    [sectionAccess],
  );

  const hasLinkedSchema = profiles.some((profile) => typeof profile.auth_user_id !== "undefined");

  const emailByProfile = useCallback((profile: Profile) => {
    const linkedUserId = profile.auth_user_id || profile.id;
    return emails[linkedUserId] ?? "";
  }, [emails]);

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
  const sectionsForProfile = (profile: Profile) => Array.from(new Set([
    ...(sectionAccessByUser[permissionOwnerId(profile)] ?? []),
    ...(sectionAccessByUser[profile.id] ?? []),
  ]));

  const profilesConAcceso = useMemo(
    () => profiles.filter((profile) => Boolean(emailByProfile(profile))),
    [profiles, emailByProfile],
  );
  const profilesSinAcceso = useMemo(
    () => profiles.filter((profile) => !emailByProfile(profile)),
    [profiles, emailByProfile],
  );
  const normalizedTableSearch = normalizeAdminSearch(tableSearch);
  const profileMatchesSearch = (profile: Profile) => {
    if (!normalizedTableSearch) return true;
    const role = primaryRoleForProfile(profile);
    return normalizeAdminSearch([
      profile.nombre,
      emailByProfile(profile),
      profile.sucursal ?? "",
      nivelLabel(role, modulesForProfile(profile)),
      role ? ROLE_LABELS[role] : "",
      ...modulesForProfile(profile).map((module) => MODULO_LABELS[module]),
      profile.activo ? "Activo" : "Inactivo",
    ].join(" ")).includes(normalizedTableSearch);
  };
  const filteredProfiles = profiles.filter(profileMatchesSearch);
  const filteredProfilesConAcceso = profilesConAcceso.filter(profileMatchesSearch);
  const filteredProfilesSinAcceso = profilesSinAcceso.filter(profileMatchesSearch);

  const exportOptions: TableExportOption[] = [
    {
      label: "Equipo operativo",
      filename: `administracion-equipo-${new Date().toISOString().slice(0, 10)}`,
      sheetName: "Equipo",
      rows: filteredProfiles.map((profile) => ({
        Nombre: profile.nombre,
        Email: emailByProfile(profile),
        Sucursal: profile.sucursal ?? "",
        Nivel: nivelLabel(primaryRoleForProfile(profile), modulesForProfile(profile)),
        Módulos: modulesForProfile(profile).map((module) => MODULO_LABELS[module]).join(", "),
        Secciones: sectionsForProfile(profile).map((id) => sections.find((section) => section.id === id)?.nombre ?? id).join(", "),
        Estado: profile.activo ? "Activo" : "Inactivo",
      })),
    },
    {
      label: "Accesos al sistema",
      filename: `administracion-accesos-${new Date().toISOString().slice(0, 10)}`,
      sheetName: "Accesos",
      rows: filteredProfilesConAcceso.map((profile) => ({
        Persona: profile.nombre,
        Email: emailByProfile(profile),
        Nivel: nivelLabel(primaryRoleForProfile(profile), modulesForProfile(profile)),
        Rol: primaryRoleForProfile(profile) ? ROLE_LABELS[primaryRoleForProfile(profile) as Role] : "",
        Módulos: modulesForProfile(profile).map((module) => MODULO_LABELS[module]).join(", "),
        Sucursal: profile.sucursal ?? "",
        Estado: profile.activo ? "Activo" : "Inactivo",
      })),
    },
  ];

  const load = async () => {
    const [profileResult, roleResult, moduloAccesoResult, sectionsResult, sectionAccessResult] = await Promise.all([
      (supabase as any).from("profiles").select("id, auth_user_id, nombre, sucursal, activo").order("nombre"),
      supabase.from("user_roles").select("user_id, role"),
      (supabase as any).from("user_modulo_acceso").select("user_id, modulo_id"),
      (supabase as any).from("app_secciones").select("id, modulo_id, nombre, orden").eq("activo", true).order("modulo_id").order("orden"),
      (supabase as any).from("user_seccion_acceso").select("user_id, seccion_id"),
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
    setSections((sectionsResult.data ?? []) as AppSection[]);
    setSectionAccess((sectionAccessResult.data ?? []) as UserSectionAccess[]);

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

  useEffect(() => {
    if (availableAdminTabs.length && !availableAdminTabs.includes(adminTab)) setAdminTab(availableAdminTabs[0]);
  }, [adminTab, availableAdminTabs]);

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
    setCreateOpen(false);
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

  const cambiarSeccionAcceso = async (profile: Profile, section: AppSection, activo: boolean) => {
    if (!isSuperAdmin || isProtectedProfile(profile)) return;
    const userId = permissionOwnerId(profile);
    setSectionBusy(section.id);
    try {
      const sectionQuery = activo
        ? (supabase as any).from("user_seccion_acceso").insert({ user_id: userId, seccion_id: section.id })
        : (supabase as any).from("user_seccion_acceso").delete().eq("user_id", userId).eq("seccion_id", section.id);
      const { error } = await sectionQuery;
      if (error) throw error;

      if (["servicios", "parque", "repuestos"].includes(section.modulo_id)) {
        const current = sectionsForProfile(profile);
        const projected = activo ? Array.from(new Set([...current, section.id])) : current.filter((id) => id !== section.id);
        const moduleStillUsed = sections.some((candidate) => candidate.modulo_id === section.modulo_id && projected.includes(candidate.id));
        const moduleQuery = moduleStillUsed
          ? (supabase as any).from("user_modulo_acceso").upsert({ user_id: userId, modulo_id: section.modulo_id }, { onConflict: "user_id,modulo_id" })
          : (supabase as any).from("user_modulo_acceso").delete().eq("user_id", userId).eq("modulo_id", section.modulo_id);
        const { error: moduleError } = await moduleQuery;
        if (moduleError) throw moduleError;
      }
      await load();
    } catch (error: any) {
      toast.error(error?.message ?? "No se pudo actualizar la sección");
    } finally {
      setSectionBusy(null);
    }
  };

  const cambiarSucursal = async (id: string, sucursal: Sucursal) => {
    const target = profiles.find((profile) => profile.id === id);
    if (target && isProtectedProfile(target)) {
      toast.error("El perfil del superadministrador está protegido");
      return;
    }
    const { error } = await supabase.from("profiles").update({ sucursal }).eq("id", id);
    if (error) toast.error(error.message);
    else {
      setSectionUser((current) => current?.id === id ? { ...current, sucursal } : current);
      load();
    }
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
      <PageHeader
        title="Administración"
        actions={adminTab === "equipo" && canManageAdmin ? (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <UserPlus className="mr-2 h-4 w-4" />
            Nuevo usuario
          </Button>
        ) : undefined}
      />

      <Tabs value={adminTab} onValueChange={(value) => { setAdminTab(value); setTableSearch(""); }}>
        <TabsList>
          {hasSectionAccess("admin.usuarios") && <TabsTrigger value="equipo">
            <Users className="mr-2 h-4 w-4" />
            Equipo y accesos
          </TabsTrigger>}
          {hasSectionAccess("admin.importaciones") && <TabsTrigger value="importar">
            <Database className="mr-2 h-4 w-4" />
            Datos
          </TabsTrigger>}
          {hasSectionAccess("admin.parametros") && <TabsTrigger value="parametros">
            <Settings2 className="mr-2 h-4 w-4" />
            Configuración
          </TabsTrigger>}
        </TabsList>

        {adminTab === "equipo" && (
          <FiltersBar
            search={{
              value: tableSearch,
              onChange: setTableSearch,
              label: "Buscar",
              placeholder: "Nombre, email, sucursal o nivel…",
              width: "w-[min(420px,34vw)]",
            }}
            activeCount={normalizedTableSearch ? 1 : 0}
            onClear={() => setTableSearch("")}
            meta={`${filteredProfiles.length} persona${filteredProfiles.length === 1 ? "" : "s"}`}
            actions={<TableExportButton options={[exportOptions[0]]} />}
          />
        )}

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

          <Card className="hidden overflow-hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Persona</TableHead>
                  <TableHead>Cuenta</TableHead>
                  <TableHead>Sucursal</TableHead>
                  <TableHead>Nivel</TableHead>
                  <TableHead>Áreas</TableHead>
                  <TableHead>Perfil</TableHead>
                  <TableHead className="w-[120px]"><span className="sr-only">Acciones</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProfiles.map((profile) => (
                  <TableRow key={profile.id}>
                    <TableCell className="font-medium">{profile.nombre}</TableCell>
                    <TableCell className="text-[12px] text-muted-foreground">
                      {emailByProfile(profile) || "Sin acceso"}
                    </TableCell>
                    <TableCell className="text-[12px]">{profile.sucursal ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{nivelLabel(primaryRoleForProfile(profile), modulesForProfile(profile))}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[260px] text-[12px] text-muted-foreground">
                      {modulesForProfile(profile).length
                        ? modulesForProfile(profile).map((module) => MODULO_LABELS[module]).join(" · ")
                        : "Sin áreas"}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-2 text-[12px]">
                        <span className={cn("h-2 w-2 rounded-full", profile.activo ? "bg-emerald-500" : "bg-muted-foreground/35")} />
                        {profile.activo ? "Activo" : "Inactivo"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" className="h-8" onClick={() => setSectionUser(profile)}>
                        {canManageAdmin && !isProtectedProfile(profile) ? "Configurar" : "Ver"}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          <div className="space-y-2 md:hidden">
            {filteredProfiles.map((profile) => (
              <Card key={profile.id} className="space-y-3 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{profile.nombre}</div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {emailByProfile(profile) || "Sin acceso"}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" className="shrink-0" onClick={() => setSectionUser(profile)}>
                    {canManageAdmin && !isProtectedProfile(profile) ? "Configurar" : "Ver"}
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-3 text-[12px]">
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Sucursal</Label>
                    <div className="mt-1">{profile.sucursal ?? "—"}</div>
                  </div>
                  <div>
                    <Label className="text-[10px] text-muted-foreground">Nivel</Label>
                    <div className="mt-1">{nivelLabel(primaryRoleForProfile(profile), modulesForProfile(profile))}</div>
                  </div>
                  <div className="col-span-2">
                    <Label className="text-[10px] text-muted-foreground">Áreas</Label>
                    <div className="mt-1 text-muted-foreground">
                      {modulesForProfile(profile).length ? modulesForProfile(profile).map((module) => MODULO_LABELS[module]).join(" · ") : "Sin áreas"}
                    </div>
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
                <div className="text-[12px] text-muted-foreground">El acceso a cada módulo se calcula desde sus secciones habilitadas.</div>
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
                    <TableHead>Secciones</TableHead>
                    <TableHead>Sucursal</TableHead>
                    <TableHead>Estado</TableHead>
                    {canManageAdmin && <TableHead className="w-[120px]">Acciones</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProfilesConAcceso.map((profile) => (
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
                          editable={canManageAdmin && !isProtectedProfile(profile) && !sections.length}
                          onToggle={(modulo, activo) => cambiarModuloAcceso(permissionOwnerId(profile), modulo, activo)}
                        />
                      </TableCell>
                      <TableCell>
                        <Button variant="outline" size="sm" className="h-8 whitespace-nowrap" onClick={() => setSectionUser(profile)} disabled={!sections.length}>
                          {sections.length ? `${sectionsForProfile(profile).length} habilitadas` : "Aplicar SQL"}
                        </Button>
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
              <Badge variant="outline">{filteredProfilesSinAcceso.length} perfiles</Badge>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {filteredProfilesSinAcceso.slice(0, 12).map((profile) => (
                <div key={profile.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium">{profile.nombre}</div>
                    <div className="truncate text-[12px] text-muted-foreground">{profile.sucursal ?? "Sin sucursal"} - {nivelLabel(primaryRoleForProfile(profile), modulesForProfile(profile))}</div>
                  </div>
                  {canManageAdmin && !isProtectedProfile(profile) && <Button variant="outline" size="sm" className="shrink-0" onClick={() => openCred(profile)}>Crear acceso</Button>}
                </div>
              ))}
              {filteredProfilesSinAcceso.length > 12 && (
                <div className="rounded-md border border-dashed px-3 py-2 text-[12px] text-muted-foreground">+{filteredProfilesSinAcceso.length - 12} perfiles sin acceso. Buscalos en Equipo para asociarlos.</div>
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

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nuevo usuario</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-[12px]">Nombre y apellido</Label>
              <Input value={nombre} onChange={(event) => setNombre(event.target.value)} autoFocus />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-[12px]">Email</Label>
              <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-[12px]">Contraseña inicial</Label>
              <div className="relative">
                <Input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} className="pr-9" />
                <button type="button" className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}>
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px]">Sucursal</Label>
              <Select value={nuSucursal} onValueChange={(value) => setNuSucursal(value as Sucursal)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{SUCURSALES.map((sucursal) => <SelectItem key={sucursal} value={sucursal}>{sucursal}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[12px]">Nivel</Label>
              <Select value={nuRol} onValueChange={(value) => setNuRol(value as AssignableRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ROLES.map((role) => <SelectItem key={role} value={role}>{ROLE_LABELS[role]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={crearUsuario} disabled={busy}>{busy ? "Creando…" : "Crear usuario"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      <Sheet open={!!sectionUser} onOpenChange={(open) => !open && setSectionUser(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader className="border-b pb-4 text-left">
            <SheetTitle>{sectionUser?.nombre}</SheetTitle>
            <SheetDescription>{sectionUser && (emailByProfile(sectionUser) || "Sin cuenta de acceso")}</SheetDescription>
          </SheetHeader>
          {sectionUser && (
            <div className="grid gap-3 border-b py-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">Sucursal</Label>
                {canManageAdmin && !isProtectedProfile(sectionUser) ? (
                  <Select value={sectionUser.sucursal ?? ""} onValueChange={(value) => cambiarSucursal(sectionUser.id, value as Sucursal)}>
                    <SelectTrigger><SelectValue placeholder="Sin definir" /></SelectTrigger>
                    <SelectContent>{SUCURSALES.map((sucursal) => <SelectItem key={sucursal} value={sucursal}>{sucursal}</SelectItem>)}</SelectContent>
                  </Select>
                ) : <div className="py-2 text-[13px]">{sectionUser.sucursal ?? "Sin definir"}</div>}
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] text-muted-foreground">Estado del perfil</Label>
                {canManageAdmin && !isProtectedProfile(sectionUser) ? (
                  <Button variant="outline" className="w-full justify-start" onClick={() => { setSectionUser(null); toggleActivo(sectionUser); }}>
                    <span className={cn("mr-2 h-2 w-2 rounded-full", sectionUser.activo ? "bg-emerald-500" : "bg-muted-foreground/35")} />
                    {sectionUser.activo ? "Activo" : "Inactivo"}
                  </Button>
                ) : (
                  <div className="flex items-center gap-2 py-2 text-[13px]"><span className={cn("h-2 w-2 rounded-full", sectionUser.activo ? "bg-emerald-500" : "bg-muted-foreground/35")} />{sectionUser.activo ? "Activo" : "Inactivo"}</div>
                )}
              </div>
            </div>
          )}
          {sectionUser && (
            <section className="space-y-3 border-b py-4">
              <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Cuenta y nivel</h3>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
                <div>
                  <div className="text-[13px] font-medium">{emailByProfile(sectionUser) || "Sin acceso al sistema"}</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">{emailByProfile(sectionUser) ? nivelLabel(primaryRoleForProfile(sectionUser), modulesForProfile(sectionUser)) : "Solo equipo operativo"}</div>
                </div>
                {canManageAdmin && !isProtectedProfile(sectionUser) && (
                  <Button variant="outline" size="sm" onClick={() => { const profile = sectionUser; setSectionUser(null); openCred(profile); }}>
                    <KeyRound className="mr-2 h-4 w-4" />
                    {emailByProfile(sectionUser) ? "Credenciales" : "Crear acceso"}
                  </Button>
                )}
                {emailByProfile(sectionUser) && canManageAdmin && !isProtectedProfile(sectionUser) && (
                  <div className="w-full border-t pt-3">
                    <Label className="text-[11px] text-muted-foreground">Nivel</Label>
                    <Select value={primaryRoleForProfile(sectionUser) ?? ""} onValueChange={(value) => cambiarRol(permissionOwnerId(sectionUser), value as AssignableRole)}>
                      <SelectTrigger className="mt-1.5"><SelectValue placeholder="Sin definir" /></SelectTrigger>
                      <SelectContent>{ROLES.map((role) => <SelectItem key={role} value={role}>{ROLE_LABELS[role]}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </section>
          )}
          <div className="space-y-3 py-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Secciones habilitadas</h3>
              {sectionUser && sections.length > 0 && <span className="text-[11px] text-muted-foreground">{sectionsForProfile(sectionUser).length} de {sections.length}</span>}
            </div>
            {sectionUser && !emailByProfile(sectionUser) && <p className="text-[12px] text-muted-foreground">Crea el acceso al sistema antes de asignar secciones.</p>}
            {!sections.length && sectionUser && (
              <div className="rounded-xl border p-3">
                <ModuloChips
                  activos={modulesForProfile(sectionUser)}
                  editable={canManageAdmin && !isProtectedProfile(sectionUser)}
                  onToggle={(modulo, activo) => cambiarModuloAcceso(permissionOwnerId(sectionUser), modulo, activo)}
                />
              </div>
            )}
            {Array.from(new Set(sections.map((section) => section.modulo_id))).map((moduleId) => (
              <section key={moduleId} className="rounded-xl border p-3">
                <div className="mb-2 text-[12px] font-semibold">{moduleId === "admin" ? "Administración" : MODULO_LABELS[moduleId as Modulo] ?? moduleId}</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {sections.filter((section) => section.modulo_id === moduleId).map((section) => {
                    const active = sectionUser ? sectionsForProfile(sectionUser).includes(section.id) : false;
                    return <button
                      key={section.id}
                      type="button"
                      disabled={!isSuperAdmin || !sectionUser || !emailByProfile(sectionUser) || isProtectedProfile(sectionUser) || sectionBusy === section.id}
                      onClick={() => sectionUser && cambiarSeccionAcceso(sectionUser, section, !active)}
                      className={cn("flex min-h-10 items-center justify-between rounded-lg border px-3 text-left text-[12px] transition-colors", active ? "border-primary/40 bg-primary/5 font-medium text-foreground" : "text-muted-foreground hover:bg-muted/40", (!isSuperAdmin || (sectionUser && (!emailByProfile(sectionUser) || isProtectedProfile(sectionUser)))) && "cursor-default")}
                    >
                      <span>{section.nombre}</span>
                      <span className={cn("h-2.5 w-2.5 rounded-full border", active ? "border-primary bg-primary" : "border-muted-foreground/30")} />
                    </button>;
                  })}
                </div>
              </section>
            ))}
            {sectionUser && canManageAdmin && !isProtectedProfile(sectionUser) && emailByProfile(sectionUser) && (
              <button type="button" className="pt-2 text-[12px] text-destructive hover:underline" onClick={() => { const profile = sectionUser; setSectionUser(null); setDelUser(profile); }}>
                Quitar acceso al sistema
              </button>
            )}
          </div>
          <SheetFooter className="border-t pt-4"><Button variant="outline" onClick={() => setSectionUser(null)}>Cerrar</Button></SheetFooter>
        </SheetContent>
      </Sheet>

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
