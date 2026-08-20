import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";
import type { Role, Sucursal } from "@/lib/constants";
import { firstAccessibleRoute, roleHasCapability, type Capability } from "@/lib/permissions";

interface Profile {
  id: string;
  auth_user_id?: string | null;
  nombre: string;
  sucursal: Sucursal | null;
  activo: boolean;
}

interface AuthCtx {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  roles: Role[];
  moduloAccess: string[];
  loading: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isGerencia: boolean;
  isJefatura: boolean;
  isOperativo: boolean;
  /** @deprecated alias de isJefatura, valido solo dentro del contexto de Servicios */
  isCabecilla: boolean;
  /** @deprecated alias de isOperativo, valido solo dentro del contexto de Servicios */
  isTecnico: boolean;
  hasModuloAccess: (moduloId: string) => boolean;
  can: (capability: Capability) => boolean;
  defaultRoute: string;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [moduloAccess, setModuloAccess] = useState<string[]>([]);
  /** Rol tecnico de emergencia, otorgado solo via user_roles (nunca asignable desde el UI de Admin). */
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const loadedUserRef = useRef<string | null>(null);
  const loadingUserRef = useRef<string | null>(null);
  const loadingPromiseRef = useRef<Promise<void> | null>(null);

  const clearUserData = () => {
    setUser(null);
    setSession(null);
    setProfile(null);
    setRoles([]);
    setModuloAccess([]);
    setIsSuperAdmin(false);
    loadedUserRef.current = null;
    loadingUserRef.current = null;
    loadingPromiseRef.current = null;
  };

  const clearInvalidLocalSession = useCallback(async () => {
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch {
      await supabase.auth.signOut().catch(() => undefined);
    } finally {
      clearUserData();
    }
  }, []);

  const loadProfileByUserId = useCallback(async (uid: string) => {
    const legacyResult = await supabase
      .from("profiles")
      .select("id, nombre, sucursal, activo")
      .eq("id", uid)
      .maybeSingle();

    if (legacyResult.error) throw legacyResult.error;
    if (legacyResult.data) return legacyResult.data as Profile;

    try {
      const linkedResult = await (supabase as any)
        .from("profiles")
        .select("id, auth_user_id, nombre, sucursal, activo")
        .eq("auth_user_id", uid)
        .maybeSingle();

      if (linkedResult.error) {
        const message = linkedResult.error.message ?? "";
        if (/auth_user_id/i.test(message) && /does not exist/i.test(message)) {
          return null;
        }
        throw linkedResult.error;
      }

      return (linkedResult.data as Profile | null) ?? null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/auth_user_id/i.test(message) && /does not exist/i.test(message)) {
        return null;
      }
      throw error;
    }
  }, []);

  const loadUserData = useCallback(async (uid: string, force = false) => {
    if (!force && loadedUserRef.current === uid) return;
    if (!force && loadingUserRef.current === uid && loadingPromiseRef.current) {
      await loadingPromiseRef.current;
      return;
    }

    loadingUserRef.current = uid;

    const promise = (async () => {
      const loadedProfile = await loadProfileByUserId(uid);
      if (loadedProfile && !loadedProfile.activo) {
        await supabase.auth.signOut();
        clearUserData();
        return;
      }

      const roleOwnerId = loadedProfile?.id ?? uid;
      const permissionOwnerIds = Array.from(new Set([uid, roleOwnerId]));
      const [{ data: roleRows }, { data: moduloRows }] = await Promise.all([
        supabase.from("user_roles").select("role").in("user_id", permissionOwnerIds),
        (supabase as any).from("user_modulo_acceso").select("modulo_id").in("user_id", permissionOwnerIds),
      ]);

      const loadedRoles = Array.from(
        new Set((roleRows ?? []).map((row: { role: Role }) => row.role)),
      );
      setProfile(loadedProfile);
      setRoles(loadedRoles);
      setModuloAccess(((moduloRows ?? []) as { modulo_id: string }[]).map((row) => row.modulo_id));
      setIsSuperAdmin(loadedRoles.includes("superadmin"));
      loadedUserRef.current = uid;
    })();

    loadingPromiseRef.current = promise;

    try {
      await promise;
    } finally {
      if (loadingUserRef.current === uid) loadingUserRef.current = null;
      if (loadingPromiseRef.current === promise) loadingPromiseRef.current = null;
    }
  }, [loadProfileByUserId]);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        setTimeout(() => {
          loadUserData(sess.user.id)
            .catch(async (error) => {
              console.error("Auth state sync failed", error);
              await clearInvalidLocalSession();
            })
            .finally(() => setLoading(false));
        }, 0);
      } else {
        clearUserData();
        setLoading(false);
      }
    });

    (async () => {
      try {
        const { data: { session: sess } } = await supabase.auth.getSession();
        setSession(sess);
        setUser(sess?.user ?? null);
        if (sess?.user) await loadUserData(sess.user.id);
      } catch (error) {
        console.error("Initial session restore failed", error);
        await clearInvalidLocalSession();
      } finally {
        setLoading(false);
      }
    })();

    return () => sub.subscription.unsubscribe();
  }, [clearInvalidLocalSession, loadUserData]);

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`auth-permissions-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_modulo_acceso" }, () => {
        void loadUserData(user.id, true);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "user_roles" }, () => {
        void loadUserData(user.id, true);
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadUserData, user]);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error };

    if (data.user) {
      const prof = await loadProfileByUserId(data.user.id);

      if (prof && prof.activo === false) {
        await supabase.auth.signOut();
        clearUserData();
        return { error: new Error("Usuario inactivo. Contacta al administrador.") };
      }
    }

    return { error: null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    clearUserData();
  };

  const refresh = async () => {
    if (user) await loadUserData(user.id, true);
  };

  const isJefatura = roles.includes("jefatura");
  const isOperativo = roles.includes("operativo");
  const defaultRoute = firstAccessibleRoute(moduloAccess, roles, isSuperAdmin);

  return (
    <Ctx.Provider
      value={{
        user,
        session,
        profile,
        roles,
        moduloAccess,
        loading,
        isAdmin: isSuperAdmin || roles.includes("admin"),
        isSuperAdmin,
        isGerencia: roles.includes("gerencia"),
        isJefatura,
        isOperativo,
        isCabecilla: isJefatura,
        isTecnico: isOperativo,
        // Solo la cuenta tecnica de emergencia tiene acceso global. El resto,
        // incluso administradores, respeta los modulos asignados.
        hasModuloAccess: (moduloId: string) => isSuperAdmin || moduloAccess.includes(moduloId),
        can: (capability: Capability) => isSuperAdmin || roleHasCapability(roles, capability),
        defaultRoute,
        signIn,
        signOut,
        refresh,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
