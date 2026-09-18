import { supabase } from "@/integrations/supabase/client";
import { SUCURSALES, type AssignableRole, type Sucursal } from "@/lib/constants";

interface NewPerson {
  nombre: string;
  sucursal: Sucursal;
  conAcceso: boolean;
  email: string;
  password: string;
  role: AssignableRole;
}

export async function createAdminPerson(person: NewPerson) {
  const nombre = person.nombre.trim();
  if (!nombre) throw new Error("El nombre y apellido son obligatorios");
  if (!SUCURSALES.includes(person.sucursal)) throw new Error("Seleccioná una sucursal válida");

  if (!person.conAcceso) {
    if (person.role !== "operativo") throw new Error("Sin acceso solo se pueden registrar operativos de Servicios");
    // RLS autoriza el alta al administrador. No crear Auth, roles ni permisos:
    // la nómina de Servicios ya incluye perfiles activos sin auth_user_id.
    const { error } = await supabase.from("profiles").insert({
      id: crypto.randomUUID(), nombre, sucursal: person.sucursal, activo: true, auth_user_id: null,
    });
    if (error) throw new Error(error.message);
    return;
  }

  if (!person.email.trim() || !person.password.trim()) throw new Error("Email y contraseña son obligatorios para crear acceso");
  if (person.password.length < 6) throw new Error("La contraseña debe tener al menos 6 caracteres");
  const { data, error } = await supabase.functions.invoke("admin-create-user", {
    body: { email: person.email.trim(), password: person.password, nombre, sucursal: person.sucursal, role: person.role },
  });
  if (error || data?.error) throw new Error(error?.message || data?.error);
  if (!data?.ok) throw new Error("No se pudo confirmar la creación del usuario");
}
