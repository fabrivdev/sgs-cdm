/** La creación interna propone el corte; el usuario lo confirma al leer el XML. */
export async function suggestReceivablesCutoff(file: File): Promise<string> {
  const header = await file.slice(0, 16384).text();
  const properties = header.match(/<(?:\w+:)?DocumentProperties\b[^>]*>([\s\S]*?)<\/(?:\w+:)?DocumentProperties>/)?.[1];
  const created = properties?.match(/<(?:\w+:)?Created>\s*([^<]+)\s*<\/(?:\w+:)?Created>/)?.[1]?.trim();
  if (!created || !/^\d{4}-\d{2}-\d{2}T/.test(created)) return "";
  const date = new Date(created);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en", { timeZone: "America/Asuncion", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const part = (type: string) => parts.find(p => p.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
