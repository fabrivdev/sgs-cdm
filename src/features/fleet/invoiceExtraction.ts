import { supabase } from "@/integrations/supabase/client";
import { completeInvoiceNumber } from "./invoiceNumber";
import { isFleetBuyerRuc, maintenanceCategories } from "./managementModel";
import { normalizePlate } from "./model";

const text = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

export function readInvoiceFields(data: unknown) {
  const fields = (data ?? {}) as Record<string, unknown>;
  const number = text(fields.invoice_number);
  const date = text(fields.invoice_date);
  const validDate =
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(date)) &&
    new Date(date).toISOString().slice(0, 10) === date;
  const rawPlate = text(fields.plate);
  const plate = /^[a-z0-9 -]+$/i.test(rawPlate) ? normalizePlate(rawPlate) : "";
  const ruc = text(fields.supplier_tax_id);
  const digits = (value: unknown) => text(value).replace(/\D/g, "");
  const validSupplier =
    /^\d{3,18}-\d$/.test(ruc) &&
    !isFleetBuyerRuc(ruc) &&
    digits(ruc) !== digits(fields.buyer_tax_id);
  const km = fields.odometer_km;
  const workDate = text(fields.performed_on);
  const validWorkDate =
    /^\d{4}-\d{2}-\d{2}$/.test(workDate) &&
    Number.isFinite(Date.parse(workDate)) &&
    new Date(workDate).toISOString().slice(0, 10) === workDate;
  const categories: unknown[] = Array.isArray(fields.categories)
    ? fields.categories
    : [];
  return {
    plate: plate.length >= 3 && plate.length <= 12 ? plate : "",
    supplier_tax_id: validSupplier ? ruc : "",
    supplier: validSupplier ? text(fields.supplier).slice(0, 200) : "",
    odometer_km:
      typeof km === "number" && Number.isSafeInteger(km) && km >= 0
        ? String(km)
        : "",
    performed_on: validWorkDate ? workDate : "",
    invoice_number: completeInvoiceNumber(number) ? number : "",
    invoice_date: validDate ? date : "",
    description: text(fields.description).slice(0, 4000),
    categories: maintenanceCategories.filter((category) =>
      categories.includes(category),
    ),
  };
}

export async function extractFleetInvoice(file: File, signal: AbortSignal) {
  if (
    !/^(application\/pdf|image\/(jpeg|png))$/.test(file.type) ||
    !file.size ||
    file.size > 12 * 1024 * 1024
  ) {
    throw new Error(
      "La lectura automática admite PDF, JPG o PNG de hasta 12 MB.",
    );
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  const { data, error } = await supabase.functions.invoke(
    "machine-document-extractor",
    {
      signal,
      body: { documentType: "FACTURA_FLOTA", dataUrl, mimeType: file.type },
    },
  );
  if (
    error ||
    data?.error ||
    data?.documentType !== "FACTURA_FLOTA" ||
    !data?.data
  ) {
    throw new Error(
      "No se pudo leer la factura. Podés completar los datos manualmente.",
    );
  }
  return readInvoiceFields(data.data);
}
