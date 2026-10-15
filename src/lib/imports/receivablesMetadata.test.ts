import { File as NodeFile } from "node:buffer";
import { expect, it } from "vitest";
import { suggestReceivablesCutoff } from "./receivablesMetadata";
it("propone la creación interna en horario de Paraguay, no la fecha del archivo", async () => {
  const file = new NodeFile(['<DocumentProperties><Created>2026-10-15T01:00:00Z</Created></DocumentProperties>'], "cxc.xml", { lastModified: Date.now() }) as unknown as File;
  expect(await suggestReceivablesCutoff(file)).toBe("2026-10-14");
});
it("sin creación interna no inventa el corte", async () => {
  expect(await suggestReceivablesCutoff(new NodeFile(["<Workbook/>"], "cxc.xml") as unknown as File)).toBe("");
});
