import type { ReactNode } from "react";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ProcessStepper({ steps, currentIndex, pulseCurrent = false }: { steps: string[]; currentIndex: number; pulseCurrent?: boolean }) {
  return <div className="grid grid-cols-4 gap-2" aria-label="Avance del proceso">
    {steps.map((step, index) => {
      const complete = index < currentIndex;
      const current = index === currentIndex;
      return <div key={step} className="min-w-0">
        <div className={cn("mb-1 h-1 rounded-full", complete || current ? "bg-primary" : "bg-border", current && pulseCurrent && "process-step-blink")} />
        <div className={cn("truncate text-[10px]", current ? "font-semibold text-foreground" : complete ? "font-medium text-primary" : "text-muted-foreground", current && pulseCurrent && "process-step-blink")}>{step}</div>
      </div>;
    })}
  </div>;
}

export function DetailSection({ title, icon, action, children, className, card = false }: { title: string; icon?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; card?: boolean }) {
  if (card) {
    return <section className={cn("overflow-hidden rounded-xl border bg-card", className)}>
      <div className="flex min-h-11 items-center justify-between gap-3 border-b bg-muted/20 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          {icon && <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</span>}
          <h3 className="truncate text-[12px] font-semibold">{title}</h3>
        </div>
        {action}
      </div>
      <div className="p-3">{children}</div>
    </section>;
  }
  return <section className={cn("space-y-2", className)}>
    <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2">{icon}<h3 className="text-[12px] font-semibold">{title}</h3></div>{action}</div>
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
