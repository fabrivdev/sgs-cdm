import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";
import type { Role, Sucursal } from "@/lib/constants";

interface Profile {
  id: string;
  nombre: string;
  sucursal: Sucursal | null;
  activo: boolean;
  username: string | null;
  login_mode: "email" | "username";
  has_login_access: boolean;
  must_change_password: boolean;
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
  mustChangePassword: boolean;
  signIn: (identifier: string, password: string) => Promise<{ error: Error | null }>;
  changePassword: (password: string) => Promise<{ error: Error | null }>;
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
      const [{ data: prof }, { data: roleRows }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, nombre, sucursal, activo, username, login_mode, has_login_access, must_change_password")
          .eq("id", uid)
          .maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", uid),
      ]);

      const loadedProfile = prof as Profile | null;
      if (loadedProfile && (!loadedProfile.activo || !loadedProfile.has_login_access)) {
        await supabase.auth.signOut();
        clearUserData();
        return;
      }

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
  }, []);

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

  const resolveIdentifierToEmail = async (identifier: string) => {
    const value = identifier.trim();
    if (!value) return { email: "", error: new Error("Ingresa tu correo o usuario") };

    if (value.includes("@")) {
      return { email: value.toLowerCase(), error: null };
    }

    const { data, error } = await supabase.functions.invoke("auth-resolve-login", {
      body: { identifier: value },
    });

    if (error || !data?.email) {
      return { email: "", error: new Error("Credenciales invalidas") };
    }

    return { email: String(data.email).toLowerCase(), error: null };
  };

  const signIn = async (identifier: string, password: string) => {
    const resolved = await resolveIdentifierToEmail(identifier);
    if (resolved.error) return { error: resolved.error };

    const { data, error } = await supabase.auth.signInWithPassword({ email: resolved.email, password });
    if (error) return { error };

    if (data.user) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("activo, has_login_access")
        .eq("id", data.user.id)
        .maybeSingle();

      if (prof && (prof.activo === false || prof.has_login_access === false)) {
        await supabase.auth.signOut();
        clearUserData();
        return { error: new Error("Tu acceso esta deshabilitado. Contacta al administrador.") };
      }
    }

    return { error: null };
  };

  const changePassword = async (password: string) => {
    if (!password || password.length < 6) {
      return { error: new Error("La contrasena debe tener al menos 6 caracteres") };
    }

    const { error: authError } = await supabase.auth.updateUser({ password });
    if (authError) return { error: authError };

    if (user) {
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ must_change_password: false })
        .eq("id", user.id);

      if (profileError) return { error: profileError };
      await loadUserData(user.id, true);
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
        mustChangePassword: profile?.must_change_password ?? false,
        signIn,
        changePassword,
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
