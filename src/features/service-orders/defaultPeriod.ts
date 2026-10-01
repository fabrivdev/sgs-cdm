import { NEW_SYSTEM_START } from "@/lib/imports/cutoff";

export const SERVICE_ORDERS_TIME_ZONE = "America/Asuncion";

export function paraguayIsoDate(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SERVICE_ORDERS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function defaultServiceOrdersPeriod(now = new Date()) {
  return { dateFrom: NEW_SYSTEM_START, dateTo: paraguayIsoDate(now) };
}
