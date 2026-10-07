import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const styles = readFileSync(resolve(process.cwd(), "src/components/ventas/sales-mobile-workspace.css"), "utf8");

describe("controles secundarios de Ventas en teléfono", () => {
  it.each([
    ".sales-period-scope button",
    ".sales-analysis-tabs button",
    ".sales-periods .sales-flat-table tbody button",
  ])("mantiene un objetivo táctil de 44 px en %s", (selector) => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    expect(styles).toMatch(new RegExp(`${escaped}\\s*\\{[^}]*min-height:\\s*44px;`));
  });
});
