type NamedProfile = { id: string; auth_user_id?: string | null; nombre: string };

export function panoramaGreetingName(userId: string, profile: NamedProfile | null): string {
  if (!userId || !profile || (profile.id !== userId && profile.auth_user_id !== userId)) return 'Usuario';
  return profile.nombre.trim() || 'Usuario';
}
