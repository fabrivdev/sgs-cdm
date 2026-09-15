import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MarcaBadge } from "./StatusBadges";
import { machineBrandClass, machineBrandStyle, visibleMachineBrand } from "@/lib/machineBrands";

afterEach(cleanup);

describe("MarcaBadge", () => {
  it.each(["CLAAS", " claas ", "HORSCH", "horsch", "NB MAQUINAS", "JOHN DEERE", "VALTRA", "OTROS", null])(
    "shows %s with the palette from Operaciones, without reclassifying brands", marca => {
      render(<MarcaBadge marca={marca} className="text-[10px]" />);
      const badge = screen.getByTitle(visibleMachineBrand(marca));
      expect(badge).toHaveTextContent(visibleMachineBrand(marca));
      expect(badge).toHaveClass(...machineBrandClass(marca).split(" "));
      expect(badge).toHaveClass("text-[10px]");
      const style = machineBrandStyle(marca);
      if (style) {
        // JSDOM's legacy CSS parser drops modern space-separated HSL values.
        const html = renderToStaticMarkup(<MarcaBadge marca={marca} />);
        expect(html).toContain(`background-color:${style.backgroundColor}`);
        expect(html).toContain(`border-color:${style.borderColor}`);
        expect(html).toContain(`color:${style.color}`);
      }
    },
  );
});
