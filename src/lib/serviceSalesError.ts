export function serviceSalesError(error: { code?: string; message?: string }) {
  if (error.code === "PGRST202" || error.message?.includes("Could not find the function")) {
    return "Actualización de base pendiente: ejecutá el SQL 20260911180000 de Servicios y recargá la página.";
  }
  return error.message || "No se pudo completar la consulta.";
}
