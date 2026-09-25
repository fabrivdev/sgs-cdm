/** Display only: source values and exports retain their original identity. */
export function operationsDate(value: string | null) {
  if (!value) return "—";
  const date = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return date ? `${date[3]}/${date[2]}/${date[1]}` : value;
}

export function operationsPeriod(value: string) {
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return operationsDate(value);
  if (/^\d{4}-\d{2}$/.test(value)) {
    const [year, month] = value.split("-");
    const label = ["ene.", "feb.", "mar.", "abr.", "may.", "jun.", "jul.", "ago.", "sept.", "oct.", "nov.", "dic."][Number(month) - 1];
    return label ? `${label} ${year}` : value;
  }
  const week = /^(\d{4})-W(\d+)$/.exec(value);
  return week ? `Sem. ${week[2]} · ${week[1]}` : value;
}

const money = new Intl.NumberFormat("es-PY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const operationsMoney = (value: number) => `$ ${money.format(value)}`;
