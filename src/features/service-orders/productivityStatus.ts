export type TechnicianStatus = "todos" | "activos" | "inactivos" | "sin-ficha";

export function matchesTechnicianStatus(row: { profileId: string | null; activo: boolean }, status: TechnicianStatus) {
  if (status === "todos") return true;
  if (status === "sin-ficha") return !row.profileId;
  return Boolean(row.profileId) && row.activo === (status === "activos");
}
