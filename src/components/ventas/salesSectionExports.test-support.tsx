import type { ReactNode } from "react";
import { fireEvent, render as renderBase, screen } from "@testing-library/react";
import { SalesSectionExportsProvider, SalesSectionExportMenu } from "./SalesSectionExports";

export const render = (ui: ReactNode) => renderBase(ui, { wrapper: ({ children }) =>
  <SalesSectionExportsProvider><SalesSectionExportMenu />{children}</SalesSectionExportsProvider> });

export async function selectExport() {
  fireEvent.keyDown(screen.getByRole("button", { name: "Acciones de la sección" }), { key: "Enter" });
  fireEvent.click(await screen.findByRole("menuitem", { name: /^Exportar/ }));
}
