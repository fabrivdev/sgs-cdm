import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";
import type { Role, Sucursal } from "@/lib/constants";

interface Profile {
  id: string;
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

  const loadUserData = useCallback(async (uid: string, force = false) => {
    if (!force && loadedUserRef.current === uid) return;
    if (!force && loadingUserRef.current === uid && loadingPromiseRef.current) {
      await loadingPromiseRef.current;
      return;
    }

    loadingUserRef.current = uid;

    const promise = (async () => {
      const [{ data: prof }, { data: rls }] = await Promise.all([
        supabase.from("profiles").select("id, nombre, sucursal, activo").eq("id", uid).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", uid),
      ]);

      const loadedProfile = prof as Profile | null;
      if (loadedProfile && !loadedProfile.activo) {
        await supabase.auth.signOut();
        clearUserData();
        return;
      }

      setProfile(loadedProfile);
      setRoles((rls ?? []).map((r: { role: Role }) => r.role));
      loadedUserRef.current = uid;
    })();

    loadingPromiseRef.current = promise;

    try {
      await promise;
    } finally {
      if (loadingUserRef.current === uid) loadingUserRef.current = null;
      if (loadingPromiseRef.current === promise) loadingPromiseRef.current = null;
    }
  }, []);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        setTimeout(() => loadUserData(sess.user.id), 0);
      } else {
        setProfile(null);
        setRoles([]);
        loadedUserRef.current = null;
        loadingUserRef.current = null;
        loadingPromiseRef.current = null;
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
      const { data: prof } = await supabase
        .from("profiles")
        .select("activo")
        .eq("id", data.user.id)
        .maybeSingle();

      if (prof && prof.activo === false) {
        await supabase.auth.signOut();
        clearUserData();
        return { error: new Error("Usuario inactivo. Contactá al administrador.") };
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
