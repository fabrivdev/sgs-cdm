import { useRef, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { Files, Printer } from "lucide-react";
import type { SectionAction } from "@/components/exports/SectionActionsMenu";
import { printMarketTabs } from "./marketPrint";

type MarketPrintViews<Tab extends string> = {
  section: string;
  active: Tab;
  activeTitle: string;
  tabs: readonly Tab[];
  href: (tab: Tab) => string;
  render: () => ReactNode;
};

export function useMarketPrintAction<Tab extends string>(
  { section, active, activeTitle, tabs, href, render }: MarketPrintViews<Tab>,
) {
  const rootRef = useRef<HTMLElement>(null);
  const actions: SectionAction[] = [
    {
      id: "market-print-pdf",
      label: "Imprimir PDF",
      icon: Printer,
      onSelect: () => rootRef.current
        ? printMarketTabs([rootRef.current], section + " - " + activeTitle)
        : undefined,
    },
    {
      id: "market-print-all",
      label: "Imprimir todas las pestañas",
      icon: Files,
      onSelect: async () => {
        const current = rootRef.current;
        if (!current) return;
        const host = document.createElement("div");
        host.inert = true;
        host.setAttribute("aria-hidden", "true");
        const width = current.getBoundingClientRect().width;
        host.style.cssText = `position:fixed;left:-${width + 20}px;top:0;width:${width}px;visibility:hidden;`;
        document.body.append(host);
        const root = createRoot(host);
        try {
          flushSync(() => root.render(tabs.filter((tab) => tab !== active).map((tab) =>
            <MemoryRouter key={tab} initialEntries={[href(tab)]}>{render()}</MemoryRouter>,
          )));
          // Responsive chart containers measure after mounting.
          await new Promise<void>((resolve) =>
            window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve())));
          const otherTabs = Array.from(host.querySelectorAll<HTMLElement>("main.market-tractors"));
          if (otherTabs.length !== tabs.length - 1) throw new Error("Faltan pestañas para imprimir.");
          otherTabs.splice(tabs.indexOf(active), 0, current);
          await printMarketTabs(otherTabs, section + " - Todas las pestañas");
        } finally {
          root.unmount();
          host.remove();
        }
      },
    },
  ];
  return { rootRef, actions };
}
