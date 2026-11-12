import { describe, expect, it, vi } from "vitest";
import { extractFleetInvoice, readInvoiceFields } from "./invoiceExtraction";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke } },
}));

describe("fleet invoice extraction", () => {
  it("does not prefill the buyer as the supplier", () => {
    expect(
      readInvoiceFields({ supplier_tax_id: "80056738-2", supplier: "CDM" }),
    ).toMatchObject({ supplier_tax_id: "", supplier: "" });
    expect(
      readInvoiceFields({
        supplier_tax_id: "111111-1",
        buyer_tax_id: "111111-1",
      }),
    ).toMatchObject({ supplier_tax_id: "" });
  });

  it("retains the issuer and explicit mileage without copying the issue date", () => {
    expect(
      readInvoiceFields({
        supplier_tax_id: "1234567-0",
        odometer_km: 41971,
        invoice_date: "2026-11-10",
      }),
    ).toMatchObject({
      supplier_tax_id: "1234567-0",
      odometer_km: "41971",
      performed_on: "",
    });
  });
});

it("recovers omitted fields with a focused read and retains the initial fields", async () => {
  const response = (data: unknown) => ({
    data: { documentType: "FACTURA_FLOTA", data },
  });
  invoke
    .mockResolvedValueOnce(
      response({
        supplier_tax_id: "80056738-2",
        invoice_number: "001-002-0000001",
        description: "Cubiertas",
      }),
    )
    .mockResolvedValueOnce(
      response({
        supplier_tax_id: "1234567-0",
        supplier: "Taller",
        odometer_km: "41.971",
      }),
    );
  const file = new File(["pdf"], "factura.pdf", { type: "application/pdf" });
  const result = await extractFleetInvoice(file, new AbortController().signal);
  expect(invoke).toHaveBeenNthCalledWith(
    2,
    "machine-document-extractor",
    expect.objectContaining({
      body: expect.objectContaining({ details: true }),
    }),
  );
  expect(result).toMatchObject({
    supplier_tax_id: "1234567-0",
    odometer_km: "41971",
    invoice_number: "001-002-0000001",
    description: "Cubiertas",
  });
});

it("uses a single explicitly labeled mileage from the description", () => {
  expect(
    readInvoiceFields({ description: "Cubiertas 265/65R17 / KM 41971" })
      .odometer_km,
  ).toBe("41971");
  expect(
    readInvoiceFields({ description: "KM 41971 / KM 41000" }).odometer_km,
  ).toBe("");
});
