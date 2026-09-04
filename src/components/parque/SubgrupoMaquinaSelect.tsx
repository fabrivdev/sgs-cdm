import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MACHINE_SUBGROUPS, canonicalMachineSubgroup } from "@/lib/machineModels";

export function SubgrupoMaquinaSelect({
  value,
  customValue,
  onValueChange,
}: {
  value?: string | null;
  customValue?: string | null;
  onValueChange: (value: string, customValue: string) => void;
}) {
  const subgroup = canonicalMachineSubgroup(value);

  return (
    <div className="space-y-1.5">
      <Select
        value={subgroup}
        onValueChange={(next) => onValueChange(next, next === "OTRO" ? customValue ?? "" : "")}
      >
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {MACHINE_SUBGROUPS.map((option) => (
            <SelectItem key={option} value={option}>
              {option === "OTRO" ? "OTRO / NUEVO SUBGRUPO" : option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {subgroup === "OTRO" && (
        <Input
          value={customValue ?? ""}
          onChange={(event) => onValueChange("OTRO", event.target.value)}
          placeholder="Escribir nuevo subgrupo"
        />
      )}
    </div>
  );
}
