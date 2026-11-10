import { QuickPeriodFilter } from "@/components/filters/QuickPeriodFilter";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { KpiItem } from "@/components/layout/AppPrimitives";
import { FilterDate, FiltersBar } from "@/components/filters/FiltersBar";
import {
  rangeError,
  type FleetFilters,
  type FilterChange,
} from "./workspaceModel";
export function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <Card className="rounded-lg shadow-none">
      <KpiItem
        label={<span className="text-[11px] normal-case">{label}</span>}
        value={value}
      />
    </Card>
  );
}
export function SummaryCards({ items }: { items: [string, ReactNode][] }) {
  return (
    <section
      aria-label="Resumen"
      className={`grid grid-cols-2 gap-2 ${items.length === 6 ? "lg:grid-cols-6" : items.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4"}`}
    >
      {items.map(([label, value]) => (
        <SummaryCard key={label} label={label} value={value} />
      ))}
    </section>
  );
}
export function Choice({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <label className="flex min-w-28 flex-col gap-2 text-[11px] text-muted-foreground">
      {label}
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 rounded-md border bg-background px-2 text-xs text-foreground"
      >
        <option value="">Todos</option>
        {options.map((v) => (
          <option key={v}>{v}</option>
        ))}
      </select>
    </label>
  );
}
export function PeriodFields({
  filters,
  onChange,
}: {
  filters: FleetFilters;
  onChange: FilterChange;
}) {
  return (
    <>
      <QuickPeriodFilter
        from={filters.from}
        to={filters.to}
        onChange={(from, to) => onChange("period", from, to)}
      />
      <FilterDate
        label="Desde"
        value={filters.from}
        onChange={(v) => onChange("from", v)}
      />
      <FilterDate
        label="Hasta"
        value={filters.to}
        onChange={(v) => onChange("to", v)}
      />
    </>
  );
}
export function FleetFilterBar({
  filters,
  onChange,
  children,
  more,
  secondaryActions,
}: {
  filters: FleetFilters;
  onChange: FilterChange;
  children?: ReactNode;
  more?: ReactNode;
  secondaryActions?: ReactNode;
}) {
  return (
    <>
      <FiltersBar
        search={{
          value: filters.search,
          onChange: (v) => onChange("search", v),
          placeholder: "Buscar",
        }}
        activeCount={Object.values(filters).filter(Boolean).length}
        onClear={() => onChange("reset", "")}
        expanded={more}
        secondaryActions={secondaryActions}
      >
        {children}
      </FiltersBar>
      {rangeError(filters) && (
        <p role="alert" className="text-xs text-destructive">
          {rangeError(filters)}
        </p>
      )}
    </>
  );
}
