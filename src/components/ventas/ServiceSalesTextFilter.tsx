import { useEffect, useState } from "react";
import { FilterCustom } from "@/components/filters/FiltersBar";

export function ServiceSalesTextFilter({ label, value, onChange }: {
  label: string; value: string; onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => {
    if (draft === value) return;
    const timer = setTimeout(() => onChange(draft), 350);
    return () => clearTimeout(timer);
  }, [draft, onChange, value]);
  const commitDraft = () => { if (draft !== value) onChange(draft); };
  return <FilterCustom label={label} width="w-[170px]">
    <input type="search" aria-label={`Filtrar ${label}`} value={draft} onChange={event=>setDraft(event.target.value)}
      onBlur={commitDraft} onKeyDown={event=>{ if (event.key === "Enter") commitDraft(); }}
      className="h-8 w-full rounded-md border border-input bg-background px-2 text-[12px]" />
  </FilterCustom>;
}
