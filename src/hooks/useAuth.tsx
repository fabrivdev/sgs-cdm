import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";
import type { Role, Sucursal } from "@/lib/constants";

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
  loading: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isCabecilla: boolean;
  isTecnico: boolean;
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
  const [loading, setLoading] = useState(true);
  const loadedUserRef = useRef<string | null>(null);
  const loadingUserRef = useRef<string | null>(null);
  const loadingPromiseRef = useRef<Promise<void> | null>(null);

  const clearUserData = () => {
    setUser(null);
    setSession(null);
    setProfile(null);
    setRoles([]);
    loadedUserRef.current = null;
    loadingUserRef.current = null;
    loadingPromiseRef.current = null;
  };

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
      const { data: roleRows } = await supabase.from("user_roles").select("role").eq("user_id", roleOwnerId);

      setProfile(loadedProfile);
      setRoles((roleRows ?? []).map((row: { role: Role }) => row.role));
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
        setTimeout(() => loadUserData(sess.user.id), 0);
      } else {
        clearUserData();
      }
    });

    supabase.auth.getSession().then(({ data: { session: sess } }) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) loadUserData(sess.user.id).finally(() => setLoading(false));
      else setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, [loadUserData]);

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

  return (
    <Ctx.Provider
      value={{
        user,
        session,
        profile,
        roles,
        loading,
        isAdmin: roles.includes("admin"),
        isSuperAdmin: (user?.email ?? "").toLowerCase() === "fabrizio.vega@cdm.com.py",
        isCabecilla: roles.includes("cabecilla"),
        isTecnico: roles.includes("tecnico"),
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
