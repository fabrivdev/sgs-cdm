export function ensureXlsxFileName(value: string) {
  const base = value.replace(/\.xlsx$/i, "").replace(/[<>:"/\\|?*]+/g, "-").trim();
  return `${base || "exportacion"}.xlsx`;
}
