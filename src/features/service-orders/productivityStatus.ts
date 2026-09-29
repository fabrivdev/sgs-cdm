export type TechnicianStatus = "todos" | "activos" | "inactivos";

export function matchesTechnicianStatus(row: { profileId: string | null; activo: boolean }, status: TechnicianStatus) {
  if (status === "todos") return true;
  const active = Boolean(row.profileId) && row.activo;
  return status === "activos" ? active : !active;
}
