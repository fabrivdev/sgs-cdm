import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (file: string) => readFileSync(resolve(process.cwd(), "src/pages", file), "utf8");

describe("mobile layout contracts", () => {
  it("keeps Calendar on the shared page gutter without changing its month exception", () => {
    const calendar = source("Calendario.tsx");
    expect(calendar).toContain("pageShellWide,");
    expect(calendar).toContain('vista === "mes" && "md:flex');
    expect(calendar).not.toContain('"w-full space-y-3 px-3 py-3 sm:px-4 lg:px-5"');
  });

  it("switches Admin from compact rows to its desktop table at the 640 px contract", () => {
    const admin = source("Admin.tsx");
    expect(admin).toContain('<Card className="hidden overflow-hidden sm:block">');
    expect(admin).toContain('<div className="divide-y overflow-hidden rounded-md border sm:hidden">');
    expect(admin).toContain('className="line-clamp-2 break-words text-[13px] font-medium leading-5"');
    expect(admin).toContain('title={PRESENCE_LABELS[presenceForProfile(profile).state]}');
    expect(admin).toContain('<span className="sr-only">Estado: {PRESENCE_LABELS[presenceForProfile(profile).state]}</span>');
    expect(admin).not.toContain('<Card className="hidden overflow-hidden md:block">');
    expect(admin).not.toContain("max-sm:whitespace-normal max-sm:break-words max-sm:text-[13px] max-sm:leading-5");
  });

  it("keeps suggestion header actions accessible and touch-sized on phones", () => {
    const suggestions = source("RepuestosSugerencias.tsx");
    expect(suggestions).toContain('aria-label="Parámetros"');
    expect(suggestions).toContain('<span className="max-sm:sr-only">Parámetros</span>');
    expect(suggestions).toContain('className="h-8 w-8 p-0 max-sm:w-11"');
  });
});
