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

---

# Design QA — Ventas de Máquinas

## Reference and scope

- Reference composition: `C:\Users\Usuario\AppData\Local\Temp\codex-clipboard-5f1af5ae-fb05-491a-92b4-1d03300aa305.png` (Ventas de Servicios, 1919 × 813).
- Implementation capture: `C:\Users\Usuario\.codex\visualizations\2026\09\08\01a081ee-91bf-73f2-ab49-65cbf14fea7c\machine-sales-qa\page-2026-09-14T14-40-18-703Z.png` (local fixture, 1600 × 1000 CSS px, DPR 1).
- Side-by-side comparison: `C:\Users\Usuario\.codex\visualizations\2026\09\08\01a081ee-91bf-73f2-ab49-65cbf14fea7c\machine-sales-qa\machine-sales-comparison.png`.
- Focused state checked: Máquinas expanded from Marca → Tipo de máquina → Modelo.
- Browser console checked: no application errors; only the existing React Router future-flag warnings.

## Fidelity checklist

- [x] Preserves the established page hierarchy: filters, four KPIs, period evolution, then a single analysis panel.
- [x] Uses the same restrained borders, spacing, compact typography, green active state and `$` currency convention as the app.
- [x] Keeps the operational detail in tables rather than decorative cards.
- [x] Adds business-specific information without changing the visual language: signed units, credit notes, NP reconciliation and model drill-down.
- [x] Column labels distinguish net measures (`Unidades netas`, `Promedio / unidad neta`, `Participación neta`).
- [x] NP links and chassis actions are visible but do not compete with the financial hierarchy.
- [x] Wide tables use deliberate horizontal scrolling and do not overlap or clip cells.
- [x] Empty states, loading states and query errors are represented in the components.

## Final review

No remaining P0, P1 or P2 visual issues were found in the tested desktop state. The implementation intentionally adapts the reference content to the machine-sales workflow instead of copying service-specific dimensions.

final result: passed

---

# Design QA — Sales mobile option 2

Date: 2026-09-24. Status: **passed for the local Sales pilot**. This is not a production, physical-device, or whole-application certification.

## Reference and implementation

Selected reference: `C:/Users/Usuario/.codex/generated_images/01a081ee-91bf-73f2-ab49-65cbf14fea7c/exec-3bcab9cd-1588-4d43-8402-9b211fc89f2a.png` (853 × 1843 pixels, approximately 390 × 843 CSS-pixel composition).

Latest comparison: `C:/Users/Usuario/Documents/Codex/2026-09-08/ad/mobile-design-review-2026-09-24/07-opcion2-maquinas-390-final.png` (390 × 844). Both images were inspected together in the same comparison call. Same initial state: Machines, Períodos, January–September fixture, three KPIs, nine month rows and total. Data is synthetic; no customer exports or production rows are included.

The local harness renders the real `Ventas` page and report components, with mock auth and RPC responses. Its simple header provides visual context only; this change preserves the production app shell. Browser: Chrome, because the in-app browser could not attach its preview. Local URL: `http://127.0.0.1:5176/mobile-review.local/sales.html`. The ignored harness is not a production route or part of the commit.

## Evidence

All captures below are under the same local `mobile-design-review-2026-09-24` directory, outside Git:

| Capture | Viewport | State |
| --- | --- | --- |
| `07-opcion2-maquinas-390-final.png` | 390 × 844 | Machines, periods |
| `08-opcion2-servicios-390-final.png` | 390 × 844 | Services, periods |
| `09-opcion2-repuestos-390-final.png` | 390 × 844 | Parts, periods |
| `10-opcion2-repuestos-resumen.png` | 390 × 844 | Parts, summary and visible analysis navigation |
| `11-opcion2-repuestos-320.png` | 320 × 780 | Parts, all nine month rows and total |
| `12-maquinas-escritorio-1280.png` | 1280 × 900 | Existing desktop composition and four KPIs |
| `13-maquinas-tablet-768.png` | 768 × 900 | Existing intermediate layout |

Services and Machines were also inspected at 320 px. Machines Resumen, Detalle, August selection, field inspection, and filter drawer were exercised. The document's scrollWidth equals clientWidth in final measured phone, tablet and desktop states; period header text has no overflow at 390 px. A visually hidden table-header label had caused 8 px of document overflow; positioning it inside its header cell resolved it. Intermediate malformed browser captures are not used as QA evidence.

## Comparison and decisions

- Passed: flat white surface, compact heading/range, three inline KPIs, search/filter pairing, visible three-way navigation, simple month rows, aligned count/money columns and pale total footer. No nested period cards, mobile accordion, view selector or hidden KPI disclosure in the selected composition.
- Passed: all three areas use the shared implementation, colors, spacing and typography. At 320 px the fixture amounts and meaningful column labels remain readable without horizontal scrolling.
- Intentional adaptation: existing Inter, logo and icon set are retained; production global navigation is not replaced. Exact date formatting and accessible sort/column controls are functional UI rather than painted mockup content. The month table uses the source's correct quantity (net units / invoices / documents), not a fabricated common unit.
- Intentional adaptation: secondary analyses are visible links in Resumen. Full detail and Excel retain original fields; a compact list is not a reduced dataset. Tablet/desktop retain prior layouts.
- No unresolved high-severity visual mismatch in the pilot. This is a faithful structural implementation, not a claim of pixel-identical reproduction.

## Automated checks and limits

- 136 tests passed across 20 files: `src/components/ventas`, `src/pages/VentasServiceFilters.test.tsx`, `src/pages/VentasMobile.test.tsx` (`--maxWorkers=2 --testTimeout=15000`). Seven new integration cases cover three initial views, explicit analysis navigation, inclusive August, detail/NC/export preservation, export permission and desktop KPIs.
- ESLint of changed TS/TSX files: no diagnostics after separating the context/hooks module.
- Type check with `--lib ES2021,DOM,DOM.Iterable`; the repository's default ES2020 library configuration reports existing `String.replaceAll` errors in `localizedAmount.ts`, outside this visual change.
- An additional broad run encountered two legacy assertions in `src/pages/Ventas.test.tsx` that still expect grouped OS detail and omit the current auth setup. That file was not rewritten as part of the design request; this document does not claim the complete repository suite is green.
- Production build checked separately. Existing large-chunk warnings are not removed by this presentation change.
- Console inspection found development-only HMR errors during the context-module move. A full reload restored the final components; the screenshots and production build above use the corrected imports.
- No SQL, migrations, financial formula changes, production writes, or external data checks. Export payloads and permissions were tested; this pass did not re-download every workbook in a browser. Virtual keyboards, real touch hardware and every report's extreme-value combination remain outside this verification.

---

# Design QA — Shared mobile header

Date: 2026-09-24. Scope: the real `AppLayout` header and notification popover, not a new redesign of page contents. User approved grouping the original logo with SIG CDM, removing the visible menu label and balancing the right-side actions.

## Reference comparison

Reference: selected option 2 above (`exec-3bcab9cd-1588-4d43-8402-9b211fc89f2a.png`, 853 × 1843). Final implementation: `C:/Users/Usuario/Documents/Codex/2026-09-08/ad/mobile-design-review-2026-09-24/19-encabezado-390-final.png`. Both were viewed together in one comparison input. State: Machines / Períodos, January–September synthetic fixture, three KPIs, nine month rows and total. Requested browser viewport: 390 × 844 CSS px; Chrome returned a scaled 375 × 811 bitmap. The comparison is structural, not a pixel-diff claim.

Unlike the earlier Sales pilot, this ignored local harness renders the real `AppLayout`, original logo, real notification popover and real menu controls. Auth and financial responses are synthetic; no production session or commercial rows were used. Local URL: `http://127.0.0.1:5177/mobile-review.local/header.html`. Chrome was used after the in-app browser attachment limitation encountered during this design review.

Passed: compact 56 px white header, 28 px logo and adjacent 15 px brand text, icon-only menu, aligned bell and 32 px avatar, subtle separator. Original Inter, logo and Lucide icons retained. All three mobile controls have 44 × 44 px targets. Explicit pixel dimensions prevent the application's existing root-font change at 640 px from shrinking touch targets before the 768 px desktop breakpoint.

## Responsive and interaction checks

Evidence directory: the same `mobile-design-review-2026-09-24` folder outside Git.

- `19-encabezado-390-final.png`: final real header with Machines.
- `15-encabezado-notificaciones-320-final.png`: Services and open empty-state notification panel; 288 px panel with 8 px left collision margin, within the 305 px document client width (scrollbar excluded).
- `16-encabezado-767-final.png`: header crop at the upper mobile boundary; measured height 56 px, logo 28 px, all three targets 44 px.
- `17-encabezado-tablet-768.png` and `18-encabezado-escritorio-1280.png`: desktop header, existing profile text and existing 3rem height (42 px with this app's 14 px desktop root). Mobile branding/menu hidden at desktop breakpoint.
- Document scrollWidth equaled clientWidth at tested widths. Navigation from Machines to Services through the actual mobile drawer was verified. Account menu opened with Enter, displayed its original actions and closed with Escape. Notifications opened/closed and fitted the narrow viewport. Eight integration tests also cover four routes, restricted sections, Administration visibility and the sign-out callback.
- Browser screenshot API produced some intermediate cropped/timed-out captures; these are not full-screen evidence. The 767 px capture is intentionally accepted only as header evidence. Final phone captures above were inspected visually. No error/warning entries were returned by the browser console check.

## Checks and limits

19 tests passed across `AppLayout.test.tsx`, `VentasMobile.test.tsx`, `MobileSalesTable.test.tsx`. Changed-file ESLint passed. Type check passed with `--lib ES2021,DOM,DOM.Iterable` (the existing default ES2020 `replaceAll` limitation remains outside this change). Final production build passed with existing large-chunk warnings. No SQL, auth changes, financial logic changes, production verification or physical-device certification. Header QA applies across the shared layout; it does not certify every page's mobile content. No high-severity header mismatch remained in these local checks.

final result: passed
