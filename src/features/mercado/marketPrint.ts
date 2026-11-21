const scrollableData = ".market-scroll, .ms-table-scroll, .ms-driver-scroll";

function screenLengths(declarations: string) {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const lengths: Record<string, number> = {
    vw: width, vh: height, vmin: Math.min(width, height), vmax: Math.max(width, height),
  };
  return declarations.replace(/(-?(?:\d*\.)?\d+)(?:[dls])?(vw|vh|vmin|vmax)\b/g,
    (_, amount, unit: string) => (Number(amount) * lengths[unit] / 100) + "px");
}

function stylesheetForScreen(sheet: CSSStyleSheet): string {
  if (sheet.disabled || (sheet.media.mediaText && !window.matchMedia(sheet.media.mediaText).matches))
    return "";
  try {
    return screenRules(sheet.cssRules);
  } catch (error) {
    // Cross-origin font stylesheets are readable by the print document as imports.
    if (error instanceof DOMException && error.name === "SecurityError" && sheet.href)
      return `@import url(${JSON.stringify(sheet.href)});`;
    throw error;
  }
}

function screenRules(rules: CSSRuleList): string {
  return Array.from(rules, (rule) => {
    if (rule instanceof CSSPageRule) return "";
    if (rule instanceof CSSMediaRule)
      return window.matchMedia(rule.conditionText).matches ? screenRules(rule.cssRules) : "";
    if (rule instanceof CSSImportRule) {
      if (rule.media.mediaText && !window.matchMedia(rule.media.mediaText).matches) return "";
      return rule.styleSheet ? stylesheetForScreen(rule.styleSheet) : rule.cssText;
    }
    if (rule instanceof CSSGroupingRule)
      return rule.cssText.slice(0, rule.cssText.indexOf("{") + 1) + screenRules(rule.cssRules) + "}";
    if (rule instanceof CSSStyleRule)
      return rule.selectorText + "{" + screenLengths(rule.style.cssText) + "}";
    return rule.cssText;
  }).join("\n");
}

export async function printMarketTab(section: HTMLElement, title: string) {
  const width = Math.ceil(section.getBoundingClientRect().width);
  if (!width) throw new Error("La pestaña no está visible.");
  const frame = document.createElement("iframe");
  frame.tabIndex = -1;
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = `position:fixed;left:-${window.innerWidth + 20}px;top:0;width:${window.innerWidth}px;height:${window.innerHeight}px;border:0;`;
  document.body.append(frame);
  try {
    const printWindow = frame.contentWindow;
    const printDocument = frame.contentDocument;
    if (!printWindow || !printDocument) throw new Error("No se pudo preparar la impresión.");
    printDocument.open();
    printDocument.write('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>');
    printDocument.close();
    const base = printDocument.createElement("base");
    base.href = document.baseURI;
    printDocument.head.append(base);
    printDocument.title = title;
    printDocument.documentElement.className = document.documentElement.className;
    printDocument.documentElement.lang = document.documentElement.lang || "es";
    printDocument.body.className = document.body.className;

    const clone = section.cloneNode(true) as HTMLElement;
    clone.style.width = width + "px";
    const original = Array.from(section.querySelectorAll<HTMLElement>(scrollableData));
    clone.querySelectorAll<HTMLElement>(scrollableData).forEach((element, index) => {
      const table = original[index].querySelector("table");
      const copy = element.querySelector("table");
      if (table && copy) copy.style.width = table.getBoundingClientRect().width + "px";
    });
    clone.querySelectorAll("[data-market-print-hide]").forEach((node) => {
      // The button still occupies its original space in the filter bar.
      (node as HTMLElement).style.visibility = "hidden";
    });
    printDocument.body.append(clone);

    const styles = printDocument.createElement("style");
    styles.textContent = Array.from(document.styleSheets, stylesheetForScreen).join("\n") + `
      html, body { margin: 0; padding: 0; height: auto; min-height: 0; }
      body { display: block; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      *, *::before, *::after { animation: none !important; transition: none !important; }
      ${scrollableData} { max-height: none !important; overflow: visible !important; }
      .market-tractors .market-scroll thead th,
      .market-tractors .ms-table-scroll :is(th, td),
      .market-tractors .ms-driver-footer { position: static; }
      .market-tractors .ms-table-scroll .ms-dealer-history td[style*="--ms-year-fill"] {
        position: relative;
        isolation: isolate;
        background-image: none;
      }
      .ms-dealer-history td[style*="--ms-year-fill"]::before {
        content: "";
        position: absolute;
        inset: 0 auto 0 0;
        width: var(--ms-year-fill);
        background: hsl(var(--muted-foreground) / .10);
        z-index: -1;
      }
    `;
    printDocument.head.append(styles);
    clone.getBoundingClientRect();
    await Promise.race([
      printDocument.fonts?.ready,
      new Promise<void>((resolve) => window.setTimeout(resolve, 2000)),
    ]);
    const pageWidth = Math.max(width, clone.scrollWidth);
    const fullHeight = Math.ceil(clone.getBoundingClientRect().height);
    const paginate = fullHeight > 4096;
    const pageHeight = paginate ? 1123 : fullHeight + 2;
    const paper = printDocument.createElement("style");
    paper.textContent = `@page { size: ${pageWidth}px ${pageHeight}px; margin: 0; }` + (paginate ? `
      @media print {
        tr, .ms-driver { break-inside: avoid; }
        .market-panel:not(:has(.market-scroll)), .ms-panel:not(:has(.ms-table-scroll)) { break-inside: avoid; }
      }
    ` : "");
    printDocument.head.append(paper);
    printWindow.addEventListener("afterprint", () => frame.remove(), { once: true });
    printWindow.focus();
    printWindow.print();
  } catch (error) {
    frame.remove();
    throw error;
  }
}
