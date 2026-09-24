import { useRef, useState } from "react";
import { Download, Loader2, MoreVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type SectionAction = {
  id: string;
  label: string;
  disabled?: boolean;
  onSelect: () => void | Promise<void>;
};

/** One entry point; callers retain their existing permissions and exporters. */
export function SectionActionsMenu({ options, busy = false, className }: {
  options: readonly SectionAction[]; busy?: boolean; className?: string;
}) {
  const running = useRef(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!options.length) return null;
  const select = async (option: SectionAction) => {
    if (busy || running.current || option.disabled) return;
    running.current = true;
    setPending(true); setFailed(false);
    try { await option.onSelect(); }
    catch { setFailed(true); }
    finally { running.current = false; setPending(false); }
  };
  return <div className="flex min-w-0 shrink-0 items-center gap-2">
    {failed && <span role="alert" className="max-w-32 truncate text-[11px] text-destructive" title="No se pudo exportar. Intentá nuevamente.">No se pudo exportar.</span>}
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="icon" aria-label="Acciones de la sección" title="Acciones de la sección"
          className={cn("h-11 w-11 shrink-0 sm:h-8 sm:w-8", className)} disabled={busy || pending || options.every(option => option.disabled)}>
          {busy || pending ? <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" /> : <MoreVertical aria-hidden="true" className="h-4 w-4" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-w-[calc(100vw-2rem)]">
        {options.map(option => <DropdownMenuItem key={option.id} disabled={busy || pending || option.disabled}
          onSelect={() => void select(option)} className="gap-2 text-[12px]" title={option.label}>
          <Download aria-hidden="true" className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{option.label}</span>
        </DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu>
  </div>;
}
