import { BookOpen, BriefcaseBusiness, CircleHelp, Package, Tractor } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const sections = [
  { icon: BookOpen, title: "Guía rápida", text: "Ubicá el módulo en el menú, aplicá los filtros principales y usá la acción destacada para avanzar." },
  { icon: BriefcaseBusiness, title: "Servicios", text: "Planificación, trabajos, calendario e indicadores operativos." },
  { icon: Tractor, title: "Parque", text: "Clientes, máquinas y stock disponible de equipos." },
  { icon: Package, title: "Repuestos", text: "Catálogo, compras y sugerencias basadas en demanda." },
];

export function HelpDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent className="w-[min(92vw,420px)]"><SheetHeader><div className="mb-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><CircleHelp className="h-4 w-4" /></div><SheetTitle>Ayuda del SIG</SheetTitle><SheetDescription>Referencia rápida disponible cuando la necesites.</SheetDescription></SheetHeader><div className="mt-5 divide-y rounded-lg border">{sections.map(({ icon: Icon, title, text }) => <section key={title} className="flex gap-3 p-3"><Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><div><h3 className="text-[13px] font-semibold">{title}</h3><p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{text}</p></div></section>)}</div></SheetContent></Sheet>;
}
