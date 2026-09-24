import { useId } from "react";
import { cn } from "@/lib/utils";
export function SalesViewSwitcher<T extends string>({ value, onChange, options }: { value: T; onChange: (value: T) => void; options: readonly (readonly [T, string])[] }) {
  const id = useId();
  return <>
    <label htmlFor={id} className="text-[11px] text-muted-foreground md:hidden">Vista
      <select id={id} value={value} onChange={e=>onChange(e.target.value as T)} className="mt-1 h-11 w-full rounded-md border bg-background px-3 text-base text-foreground">
        {options.map(([key,label])=><option key={key} value={key}>{label}</option>)}
      </select>
    </label>
    <div className="hidden h-8 overflow-hidden rounded-md border text-[11px] md:flex md:shrink-0">
      {options.map(([key,label])=><button key={key} type="button" aria-pressed={value===key} onClick={()=>onChange(key)} className={cn("px-3 hover:bg-accent",value===key&&"bg-primary text-primary-foreground hover:bg-primary")}>{label}</button>)}
    </div>
  </>;
}
