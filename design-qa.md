# Design QA — historial de máquina y detalle de OS

- Source visual truth: `C:\Users\Usuario\AppData\Local\Temp\codex-clipboard-f880f7ff-a3f6-404b-a129-a843107a6e73.png`
- Implementation evidence: Chrome CUA inline captures produced during this task (Resumen, Servicios expanded, Repuestos expanded). The browser surface does not expose a filesystem screenshot path.
- Source pixels: 1672 × 941.
- Implementation viewport: 1536 × 678 CSS px at devicePixelRatio 1.25.
- State: right-side drawer open; Resumen, Servicios, expanded OS, Repuestos, and expanded parts table tested.
- Density normalization: comparison used the complete right drawer in both captures; browser chrome and the intentionally different background page were excluded from the judgment.

## Full-view comparison evidence

The implementation preserves the selected reference's wide right drawer, strong header, three-tab hierarchy, compact KPI strip, chronological OS cards, inline expansion, muted borders, and app green as the only navigation accent. The adapted implementation intentionally removes the reference's export button, filter chips, per-row view buttons, and redundant show/hide actions, in accordance with the request for fewer buttons.

## Focused-region comparison evidence

- Header/tabs: same hierarchy and proportion, with a denser title block aligned to the existing app typography.
- Service history: an entire OS row is the disclosure control; expanded content shows work, financial composition, technician, billing state, and related invoices.
- Parts history: expanded table visibly includes both required identifiers (`Cód. repuesto` and `Cód. fabricante`), description, quantity, unit price, total, and invoice.
- Values use `$`, consistent with the rest of the app.

## Required fidelity surfaces

- Fonts and typography: existing application font stack and weight scale retained; headings, metadata, badges, tabular values, and monospaced identifiers form a clear hierarchy without wrapping regressions.
- Spacing and layout rhythm: 900 px maximum drawer width, 5 px-equivalent content rhythm through existing Tailwind tokens, compact 8 px controls, and consistent bordered groups. No clipped persistent controls at the tested viewport.
- Colors and visual tokens: existing background, border, muted, primary, and semantic badge tokens used. No new palette or decorative gradient introduced.
- Image quality and asset fidelity: the reference contains no app-specific raster imagery required by this detail. Existing Lucide icon system is reused consistently; no placeholder or handmade graphic substitutes.
- Copy and content: labels follow the business vocabulary: OS, tipo de tiempo, mano de obra, kilometraje, repuestos, terceros, técnico, facturación, and facturas relacionadas.

## Findings

No actionable P0, P1, or P2 mismatch remains. The reduced button count and simplified toolbar are intentional product adaptations requested by the user, not fidelity defects.

## Interaction and console checks

- Tabs Resumen / Servicios / Repuestos: passed.
- Expand/collapse an OS by clicking the row: passed.
- Navigate from latest intervention to its service detail: passed.
- Parts table with internal and manufacturer codes: passed.
- Console: no application errors. Only pre-existing React Router v7 future-flag warnings were observed.

## Comparison history

- Initial P2: a state reset prevented the OS body from remaining expanded in the visual harness.
- Fix: the data-loading effect now depends on stable target identifiers (`chassis` and `os`) instead of object identity.
- Post-fix evidence: the OS remains expanded and exposes work, composition, technician, billing, invoices, and the complete parts table.

## Follow-up polish

- P3: validate very long model/client combinations against production data; current header truncation and wrapping are acceptable at the tested viewport.

final result: passed
