import { shortPersonName } from "@/lib/personName";
const reviewed: Record<string, string> = {
  "ANIBAL VILLALBA ROLON": "ANIBAL VILLALBA",
  "JUAN GABRIEL GAVILAN MEZA": "JUAN GAVILAN",
  "AGUEDO AGUSTIN ARRUA ROJAS": "AGUEDO ARRUA",
  "GUSTAVO ARIEL ARCE OCAMPO": "GUSTAVO ARCE",
  "RODOLFO GALEANO ORUE": "RODOLFO GALEANO",
  "JONATHAN EZEQUIEL GARCETE MARTINEZ": "JONATHAN GARCETE",
  "BRUNO ALEXIS TELLEZ MALDONADO": "BRUNO TELLEZ",
  "HUGO RAMON RODAS RODRIGUEZ": "HUGO RODAS",
  "EDER ARIEL ESQUIVEL CANO": "EDER ESQUIVEL",
  "DIEGO MORINIGO GONZALEZ": "DIEGO MORINIGO",
  "JORGE EDUARDO DE MORAIS DA SILVA": "JORGE DE MORAIS",
};
export function fleetResponsibleName(
  full: string | null | undefined,
  short?: string | null,
) {
  if (short?.trim()) return short.trim();
  const name = (full ?? "").trim().replace(/\s+/g, " ");
  if (name.split(" ").length <= 2) return name;
  return reviewed[name.toUpperCase()] ?? shortPersonName(name);
}
export const personKey = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/\s+/g, " ")
    .trim();

export function structuredResponsibleName(names: string, surnames: string) {
  const first = names.trim().split(/\s+/)[0];
  const surname =
    surnames
      .trim()
      .match(/^(?:(?:de|del|la|las|los|da|das|do|dos|van|von)\s+)*\S+/i)?.[0] ??
    "";
  return [first, surname].filter(Boolean).join(" ");
}
