import { Children, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { cardLabel, kpiValue, metaText, sectionTitle } from "@/lib/ui-classes";

export function PageShell({ children, className }: { children: ReactNode; className?: string }) {
  return <main className={cn("w-full min-w-0 space-y-3 px-4 py-3 sm:px-5 sm:py-4 lg:px-6", className)}>{children}</main>;
}

export function PageHeader({ title, actions, tabs, meta, className }: { title: ReactNode; actions?: ReactNode; tabs?: ReactNode; meta?: ReactNode; className?: string }) {
  return <header className={cn("flex min-h-8 min-w-0 flex-col justify-center gap-1", className)}>
    <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h1 className="truncate text-[18px] font-semibold leading-6 tracking-[-0.02em]">{title}</h1>
        {meta && <div className={metaText}>{meta}</div>}
      </div>
      {(tabs || actions) && <div className="flex shrink-0 items-center gap-2">{tabs}{actions}</div>}
    </div>
  </header>;
}


export function KpiStrip({ children, className, mobilePrimary }: { children: ReactNode; className?: string; mobilePrimary?: readonly number[] }) {
  const mobile = useIsMobile(640);
  const items = Children.toArray(children);
  if (mobile && mobilePrimary?.length && items.length > mobilePrimary.length) {
    const primary = new Set(mobilePrimary);
    return <section aria-label="Indicadores" className="min-w-0">
      <div className="grid grid-cols-2 border-y bg-card [&>div]:px-1 [&>div]:py-2.5">{items.filter((_, index) => primary.has(index))}</div>
      <details className="group min-w-0">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 text-[11px] text-muted-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">Más indicadores<ChevronDown className="h-3.5 w-3.5 group-open:rotate-180" /></summary>
        <div className="grid grid-cols-2 border-b bg-card [&>div]:px-1">{items.filter((_, index) => !primary.has(index))}</div>
      </details>
    </section>;
  }
  return <section className={cn("grid grid-cols-2 min-h-[64px] overflow-hidden rounded-xl border bg-card max-sm:[&>*]:border-b max-sm:[&>*:nth-child(odd)]:border-r max-sm:[&>*:last-child:nth-child(odd)]:col-span-2 sm:grid-cols-none sm:grid-flow-col sm:auto-cols-fr sm:divide-x", className)}>{children}</section>;
}

export function KpiItem({ label, value, detail, tone = "default", icon, className }: { label: ReactNode; value: ReactNode; detail?: ReactNode; tone?: "default" | "positive" | "info" | "warning" | "danger"; icon?: ReactNode; className?: string }) {
  const tones = { default: "text-foreground", positive: "text-emerald-600", info: "text-blue-600", warning: "text-amber-600", danger: "text-destructive" };
  return <div className={cn("flex min-w-0 flex-col justify-start gap-1 px-3 py-2.5", className)}>
    <div className={cn("flex min-h-4 items-center justify-between gap-2 sm:h-4", cardLabel)}><span className="sm:truncate">{label}</span>{icon && <span className="shrink-0 text-muted-foreground [&_svg]:h-3.5 [&_svg]:w-3.5">{icon}</span>}</div>
    <div className={cn(kpiValue, "max-sm:text-[clamp(14px,4.3vw,20px)]", tones[tone])}>{value}</div>
    <div className={cn("min-h-4 text-[10px] leading-4 text-muted-foreground sm:h-4 sm:truncate", detail == null && "hidden sm:block")}>{detail ?? <span aria-hidden>&nbsp;</span>}</div>
  </div>;
}

export function CompactToolbar({ children, className }: { children: ReactNode; className?: string }) { return <div className={cn("flex min-w-0 flex-wrap items-center gap-2", className)}>{children}</div>; }
export function Panel({ children, className }: { children: ReactNode; className?: string }) { return <section className={cn("min-w-0 rounded-xl border bg-card p-3.5", className)}>{children}</section>; }
export function SectionHeader({ title, actions, meta }: { title: ReactNode; actions?: ReactNode; meta?: ReactNode }) { return <div className="flex min-h-8 flex-wrap items-center justify-between gap-3"><div className="min-w-0"><h2 className={sectionTitle}>{title}</h2>{meta && <div className={metaText}>{meta}</div>}</div>{actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}</div>; }
export function TruncatedText({ children, className }: { children: string; className?: string }) { return <span className={cn("block truncate", className)} title={children}>{children}</span>; }

