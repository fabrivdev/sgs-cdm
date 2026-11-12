import { describe, expect, it, vi } from "vitest";
import { readInvoiceFields } from "./invoiceExtraction";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

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
