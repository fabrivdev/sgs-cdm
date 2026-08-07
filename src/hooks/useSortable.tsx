import { useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

/**
 * Estado de orden para una tabla con encabezados clickeables. Mismo
 * comportamiento que ya usaba MaquinasTab.tsx (ahí a mano, acá reusable):
 * click en una columna nueva ordena ascendente, click de nuevo invierte.
 */
export function useSortable<K extends string>(initialKey: K, initialDir: "asc" | "desc" = "asc") {
  const [sortKey, setSortKey] = useState<K>(initialKey);
  const [sortDir, setSortDir] = useState<"asc" | "desc">(initialDir);

  const toggleSort = (key: K) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sortIcon = (key: K) => {
    if (sortKey !== key) return <ArrowUpDown className="h-3 w-3 opacity-50" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };

  return { sortKey, sortDir, setSortKey, setSortDir, toggleSort, sortIcon };
}
