export const persistedBillingTimeType = (value: string): string | null =>
  value === "Desconocido" ? null : value;
