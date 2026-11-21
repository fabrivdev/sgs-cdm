import { useRef } from "react";
import { Printer } from "lucide-react";
import type { SectionAction } from "@/components/exports/SectionActionsMenu";
import { printMarketTab } from "./marketPrint";

export function useMarketPrintAction(title: string) {
  const rootRef = useRef<HTMLElement>(null);
  const action: SectionAction = {
    id: "market-print-pdf",
    label: "Imprimir PDF",
    icon: Printer,
    onSelect: () => rootRef.current ? printMarketTab(rootRef.current, title) : undefined,
  };
  return { rootRef, action };
}
