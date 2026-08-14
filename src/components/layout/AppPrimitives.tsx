import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageShell({ children, className }: { children: ReactNode; className?: string }) {
  return <main className={cn("w-full space-y-3 px-3 py-3 sm:px-4 lg:px-5", className)}>{children}</main>;
}

export function PageHeader({ title, actions, tabs, meta, className }: { title: ReactNode; actions?: ReactNode; tabs?: ReactNode; meta?: ReactNode; className?: string }) {
  return <header className={cn("flex min-h-10 min-w-0 flex-col justify-center gap-1.5", className)}>
    <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0"><h1 className="truncate text-[24px] font-semibold leading-[30px] tracking-[-0.025em]">{title}</h1>{meta && <div className="text-[11px] leading-4 text-muted-foreground">{meta}</div>}</div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
    {tabs && <div className="border-b">{tabs}</div>}
  </header>;
}

export function KpiStrip({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("grid min-h-[68px] overflow-hidden rounded-lg border bg-card divide-y sm:grid-flow-col sm:auto-cols-fr sm:divide-x sm:divide-y-0", className)}>{children}</section>;
}

export function KpiItem({ label, value, detail, tone = "default", icon, className }: { label: ReactNode; value: ReactNode; detail?: ReactNode; tone?: "default" | "positive" | "info" | "warning" | "danger"; icon?: ReactNode; className?: string }) {
  const tones = { default: "text-foreground", positive: "text-emerald-600", info: "text-blue-600", warning: "text-amber-600", danger: "text-destructive" };
  return <div className={cn("flex min-w-0 flex-col justify-center px-3 py-2", className)}>
    <div className="flex items-center justify-between gap-2 text-[11px] font-medium uppercase leading-4 tracking-[0.035em] text-muted-foreground"><span className="truncate">{label}</span>{icon && <span className="shrink-0 text-muted-foreground [&_svg]:h-4 [&_svg]:w-4">{icon}</span>}</div>
    <div className={cn("text-[24px] font-semibold leading-7 tabular-nums", tones[tone])}>{value}</div>
    {detail && <div className="truncate text-[11px] leading-4 text-muted-foreground">{detail}</div>}
  </div>;
}

export function CompactToolbar({ children, className }: { children: ReactNode; className?: string }) { return <div className={cn("flex min-w-0 flex-wrap items-center gap-2", className)}>{children}</div>; }
export function Panel({ children, className }: { children: ReactNode; className?: string }) { return <section className={cn("rounded-lg border bg-card p-3", className)}>{children}</section>; }
export function SectionHeader({ title, actions, meta }: { title: ReactNode; actions?: ReactNode; meta?: ReactNode }) { return <div className="flex min-h-8 items-center justify-between gap-3"><div className="min-w-0"><h2 className="truncate text-[15px] font-semibold leading-5">{title}</h2>{meta && <div className="text-[11px] leading-4 text-muted-foreground">{meta}</div>}</div>{actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}</div>; }
export function TruncatedText({ children, className }: { children: string; className?: string }) { return <span className={cn("block truncate", className)} title={children}>{children}</span>; }
