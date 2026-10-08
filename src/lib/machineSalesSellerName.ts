import { shortPersonName } from "./personName";

const nameKey = (name: string) => name
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLocaleUpperCase("es-PY");

export function machineSalesSellerName(value: unknown) {
  const name = shortPersonName(value);
  return nameKey(name) === "CARLOS" ? "CARLOS BENITEZ" : name;
}
