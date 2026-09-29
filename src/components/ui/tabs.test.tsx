import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Tabs, TabsList, TabsTrigger } from "./tabs";

describe("TabsList", () => {
  it("does not create native scrollbars beside compact tabs", () => {
    render(<Tabs defaultValue="one"><TabsList aria-label="Secciones">
      <TabsTrigger value="one">Una</TabsTrigger>
      <TabsTrigger value="two">Otra</TabsTrigger>
    </TabsList></Tabs>);
    const list = screen.getByRole("tablist", { name: "Secciones" });
    expect(list).toHaveClass("overflow-hidden");
    expect(list).not.toHaveClass("overflow-x-auto");
  });
});
