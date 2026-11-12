import type { ReactNode } from "react";
import { Panel } from "@/components/layout/AppPrimitives";

export function SalesExplorerPanel({
  title,
  switcher,
  children,
}: {
  title: string;
  switcher: ReactNode;
  children: ReactNode;
}) {
  return (
    <Panel className="sales-explorer p-3">
      <div className="sales-explorer-heading flex min-h-8 flex-col gap-3 border-b pb-3 md:flex-row md:items-center md:justify-between">
        <h2 className="truncate text-[13px] font-semibold">{title}</h2>
        {switcher}
      </div>
      {children}
    </Panel>
  );
}
