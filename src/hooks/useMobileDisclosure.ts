import { useState, type SetStateAction } from "react";
import { useIsMobile } from "./use-mobile";

/** Phone default only; user choice survives resize. Errors stay visible. */
export function useMobileDisclosure(forceOpen = false) {
  const mobile = useIsMobile(640);
  const [choice, setChoice] = useState<boolean | null>(null);
  const collapsed = !forceOpen && (choice ?? mobile);
  const setCollapsed = (next: SetStateAction<boolean>) => setChoice(typeof next === "function" ? next(collapsed) : next);
  return [collapsed, setCollapsed] as const;
}
