import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Phone-only callers group identity, never merge source fields or export values. */
export function MobileRecord({ primary, secondary, context, className }: {
  primary: ReactNode; secondary?: ReactNode; context?: ReactNode; className?: string;
}) {
  return <span className={cn("mobile-record block min-w-0 whitespace-normal text-left font-sans", className)}>
    <span className="block break-words text-[13px] font-medium leading-[18px] [overflow-wrap:anywhere]">{primary}</span>
    {secondary != null && <span className="mt-0.5 block break-words text-[11px] font-normal leading-4 text-muted-foreground [overflow-wrap:anywhere]">{secondary}</span>}
    {context != null && <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] font-normal leading-4 text-muted-foreground">{context}</span>}
  </span>;
}
