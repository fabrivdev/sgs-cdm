import { useMemo, useState } from "react";
import { FilterCustom } from "./FiltersBar";
import { quickPeriodPresets, type QuickPeriodPreset } from "./quickPeriodPresets";

/** Date-range shortcut for filter bars. Manually edited dates remain a custom period. */
export function QuickPeriodFilter({ from, to, onChange, endAtToday = false }: {
  from: string; to: string; onChange: (from: string, to: string, mode: QuickPeriodPreset["mode"]) => void;
  endAtToday?: boolean;
}) {
  const [today] = useState(() => new Date());
  const presets = useMemo(() => quickPeriodPresets(today, endAtToday), [today, endAtToday]);
  const selected = presets.find(preset => preset.from === from && preset.to === to)?.key ?? "";
  return <FilterCustom label="Período rápido" width="w-[190px]">
    <select aria-label="Período rápido" value={selected} onChange={event => {
      const preset = presets.find(item => item.key === event.target.value);
      if (preset) onChange(preset.from, preset.to, preset.mode);
    }} className="h-8 w-full rounded-md border border-input bg-background px-2 text-[12px]">
      <option value="">Personalizado</option>
      {presets.map(preset => <option key={preset.key} value={preset.key}>{preset.label}</option>)}
    </select>
  </FilterCustom>;
}
