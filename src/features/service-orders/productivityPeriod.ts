import { NEW_SYSTEM_START } from "@/lib/imports/cutoff";
import { validOperationsRange } from "./data";

/** Availability of dated work, not proof that every later import is complete.
 * Legacy OS through June have only opening dates; never infer work from them.
 */
export function productivityPeriod(requestedFrom: string, requestedTo: string) {
  const valid = validOperationsRange(requestedFrom, requestedTo);
  const available = valid && requestedTo >= NEW_SYSTEM_START;
  return {
    requestedFrom, requestedTo,
    from: available ? (requestedFrom < NEW_SYSTEM_START ? NEW_SYSTEM_START : requestedFrom) : null,
    to: available ? requestedTo : null,
    includesLegacy: valid && requestedFrom < NEW_SYSTEM_START,
  };
}

export type ProductivityPeriod = ReturnType<typeof productivityPeriod>;
