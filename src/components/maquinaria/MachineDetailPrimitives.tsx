import type { ReactNode } from "react";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ProcessStepper({ steps, currentIndex }: { steps: string[]; currentIndex: number }) {
  return <div className="grid grid-cols-4 gap-2" aria-label="Avance del proceso">
    {steps.map((step, index) => {
      const complete = index < currentIndex;
      const current = index === currentIndex;
      return <div key={step} className="min-w-0">
        <div className={cn("mb-1 h-1 rounded-full", complete || current ? "bg-primary" : "bg-border")} />
        <div className={cn("truncate text-[10px]", current ? "font-semibold text-foreground" : complete ? "font-medium text-primary" : "text-muted-foreground")}>{step}</div>
      </div>;
    })}
  </div>;
}

export function DetailSection({ title, action, children, className }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={cn("space-y-2", className)}>
    <div className="flex items-center justify-between gap-3"><h3 className="text-[12px] font-semibold">{title}</h3>{action}</div>
    {children}
  </section>;
}

export function KeyValueGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <dl className={cn("grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3", className)}>{children}</dl>;
}

export function KeyValueItem({ label, value, empty = "No informado", mono = false, prominent = false }: { label: string; value: ReactNode; empty?: string; mono?: boolean; prominent?: boolean }) {
  const visible = value !== null && value !== undefined && value !== "" && value !== "—";
  return <div className="min-w-0"><dt className="text-[10px] text-muted-foreground">{label}</dt><dd className={cn("mt-0.5 break-words text-[12px] font-medium", mono && "font-mono", prominent && "text-[16px] font-semibold")}>{visible ? value : empty}</dd></div>;
}

export function EntityCard({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("rounded-xl border p-3", className)}>{children}</div>;
}

export function DocumentRow({ label, fileName, date, onOpen, action }: { label: string; fileName?: string | null; date?: string | null; onOpen?: () => void; action?: ReactNode }) {
  return <div className="flex min-w-0 items-center justify-between gap-3 border-b py-2.5 last:border-b-0">
    <div className="min-w-0"><div className="text-[11px] font-medium">{label}</div><div className="mt-0.5 truncate text-[10px] text-muted-foreground">{fileName || "Sin documento"}{fileName && date ? ` · ${date}` : ""}</div></div>
    <div className="flex shrink-0 items-center gap-1.5">{fileName && onOpen && <Button type="button" variant="ghost" size="sm" className="h-8" onClick={onOpen}><Eye className="mr-1.5 h-3.5 w-3.5" />Ver</Button>}{action}</div>
  </div>;
}
