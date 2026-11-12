import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import {
  openStoredDocument,
  StoredDocumentViewer,
} from "./StoredDocumentViewer";

const { from, download } = vi.hoisted(() => {
  const download = vi.fn();
  return { from: vi.fn(() => ({ download })), download };
});
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { storage: { from } },
}));

it("opens a private fleet attachment in the shared viewer with a download link", async () => {
  download.mockResolvedValue({
    data: new Blob(["image"], { type: "image/png" }),
  });
  const createObjectURL = vi.fn(() => "blob:invoice");
  const revokeObjectURL = vi.fn();
  vi.stubGlobal(
    "URL",
    Object.assign(class extends URL {}, { createObjectURL, revokeObjectURL }),
  );
  try {
    const view = render(
      <>
        <button
          onClick={() =>
            openStoredDocument("fleet-invoices", "user/receipt", "factura.png")
          }
        >
          Abrir factura
        </button>
        <StoredDocumentViewer bucket="maquinaria-documentos" />
        <StoredDocumentViewer bucket="fleet-invoices" />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Abrir factura" }));
    expect(
      await screen.findByRole("img", { name: "factura.png" }),
    ).toHaveAttribute("src", "blob:invoice");
    expect(screen.getByRole("link", { name: "Descargar" })).toHaveAttribute(
      "download",
      "factura.png",
    );
    expect(from).toHaveBeenCalledExactlyOnceWith("fleet-invoices");
    expect(download).toHaveBeenCalledExactlyOnceWith("user/receipt");
    view.unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:invoice");
  } finally {
    vi.unstubAllGlobals();
  }
});
