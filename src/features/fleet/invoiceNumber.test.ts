import { expect, it } from "vitest";
import {
  formatInvoiceNumber,
  completeInvoiceNumber,
  guideInvoiceNumber,
} from "./invoiceNumber";
it("pads known segments without inventing missing data", () => {
  expect(formatInvoiceNumber("001-001-3996")).toBe("001-001-0003996");
  expect(formatInvoiceNumber("014-020-0159703")).toBe("014-020-0159703");
  expect(formatInvoiceNumber("0010010003996")).toBe("001-001-0003996");
  expect(formatInvoiceNumber("3996")).toBe("3996");
  expect(formatInvoiceNumber("001-001-12345678")).toBe("001-001-12345678");
  expect(completeInvoiceNumber("001-001-3996")).toBe(false);
  expect(completeInvoiceNumber("001-001-0003996")).toBe(true);
});
it("guides typing without truncating pasted numbers", () => {
  expect(guideInvoiceNumber("0010")).toBe("001-0");
  expect(guideInvoiceNumber("001-0013")).toBe("001-001-3");
  expect(guideInvoiceNumber("0010010003996")).toBe("001-001-0003996");
  expect(guideInvoiceNumber("001-001-3996")).toBe("001-001-3996");
});
