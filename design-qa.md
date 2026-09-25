# Design QA — ajuste específico del Planificador móvil

25/09/2026, base `79555bb55534a437f176e2d7c4b9405e44c57966`. Sólo cambia Planificador bajo 640 px: agenda plana, fecha lateral, cliente prioritario, descripción secundaria de dos líneas, referencia/estado/continuidad y navegación de semana compacta. Sin horas ni total al pie en teléfono por indicación del usuario. Escritorio/tablet, detalle, fuentes y exportación conservan horas y comportamiento; las otras secciones aprobadas no cambian.

Comprobación visual con componentes reales y fixtures ficticias locales de sólo lectura: 320 y 390 px sin desbordamiento horizontal (ancho del documento igual a su área útil: 305 y 375 px, respectivamente). Se verificaron textos largos, estados, horas ausentes y cargadas que no se muestran, cambio de semana y estado vacío. A 768 px se conserva la tabla y su total. Evidencia fuera de Git: `C:/Users/Usuario/Documents/Codex/2026-09-08/ad/planner-mobile-2026-09-25/planificador-320.png`, `planificador-390.png` y `planificador-768.png`.

26 pruebas correctas en cuatro archivos: `ServiceLists`, `MobilePresentation`, `FiltersBar.mobile` y `MobileAgenda`. Ocho regresiones nuevas comprueban fronteras 639/640, identidad de jornadas del mismo día, apertura con horas originales, exportación completa/orden, navegación y fallo/reintento. TypeScript correcto con librería ES2021 por `replaceAll` preexistente; compilación correcta con advertencias previas de chunks grandes. No se ejecutó SQL ni se escribió en datos productivos. No se afirma comprobación en teléfono físico o despliegue. Sin `obsidian-sync.local`: se actualiza la nota curada del repositorio, no se acredita sincronización de la bóveda.

---

# Design QA — revisión móvil transversal y excepción multilínea

Fecha: 24/09/2026. Base: `10701175fa72edfc370900251fe35168f4d58403`. Solicitud: corregir la revisión general, permitiendo agrupar identidad en teléfono y conservando columnas de escritorio/tablet. La auditoría anterior cubrió 18 rutas principales con capturas de lectura; no se modificaron datos productivos.

## Resultado de implementación

Menos contenedores y desplegables principales, título de 18 px, búsqueda visual de 36 px y pestañas discretas de 12 px/44 px táctiles. `MobileRecord` agrupa identidad bajo 640 px y `CompactListTable.mobileColumns` conserva el orden por los campos secundarios. Modelo/chasis/cliente, NP/cliente, descripción/código y jornada/referencia pueden envolver; no se agrupan registros ni se alteran cálculos. Compras conserva detalle completo de ítems, Comisiones conserva selección y pago explícito, Operaciones conserva facturación y entrega como estados distintos. Guía funcional actualizada en `docs/knowledge/24-Condiciones-visuales-ventas.md` y `25-Revision-movil-transversal.md`.

## Comprobación visual local

Navegador Chrome, componentes reales, backend sustituido por fixtures ficticias de sólo lectura en `mobile-review.local` (ignorado por Git). No se ejecutaron pagos, transferencias ni escrituras remotas. Evidencia fuera del repositorio: `C:/Users/Usuario/Documents/Codex/2026-09-08/ad/mobile-implementation-2026-09-24`.

- 320 px: revisión de Stock proyectado (incluido negativo y términos de fórmula en detalle), Ventas de Servicios, Planificador, Calendario Mes/Semana, Trabajos, Administración, Comisiones, pedidos/importaciones, sugerencias, pestañas de ficha y compras/solicitudes con ítems. Se corrigieron encabezados estrechos de Proyectado, Cantidad de ítems y el colspan del estado vacío de Comisiones. Capturas representativas: `admin-320.png`, `planificador-320.png`, `comisiones-320.png`, `pedidos-320.png`, `importaciones-320.png`, `sugerencias-320.png`, `solicitudes-320.png`.
- 390 px: Stock de Repuestos y composición final de Ventas de Servicios (`ventas-servicios-390.png`). Medición DOM: buscador 36 px/entrada 16 px; pestañas 44 px/texto 12 px; ancho del documento 375 px con viewport de 390 px y scrollbar, sin desbordamiento horizontal.
- 768/1280 px: Stock de Repuestos y Compras, respectivamente (`stock-tablet-768.png`, `compras-escritorio-1280.png`). Sin `MobileRecord` montado y sin desbordamiento del documento; se conserva la elipsis previa en columnas estrechas de tablet, no se acredita lectura simultánea íntegra de todos sus valores.
- Dashboard: fechas consultadas y cuatro pestañas visibles a 320 px. La fixture fuerza fuente financiera incompleta y conserva el error sin cifras parciales; no valida el cálculo financiero del Dashboard.
- El viewport temporal se restauró. Algunas capturas de página completa agotaron el tiempo del navegador; se utilizaron capturas de viewport verificadas, no se presentan esos intentos como evidencia.

## Pruebas y límites

Pasada final secuencial: **33 archivos / 212 pruebas correctas**, incluyendo Ventas, exportaciones, permisos, callbacks, calendario, Administración, Comisiones, Compras y listas de Parque. Pruebas nuevas verifican fronteras 320/390/639 frente a 640/768/1280 px, identidad, orden oculto y que seleccionar/inspeccionar una OS no ejecute una liquidación. Dos pasadas concurrentes agotaron los 5 segundos de una prueba de Repuestos; la misma prueba y suite pasaron secuencialmente sin aumentar su límite ni cambiar sus aserciones.

TypeScript correcto con `--lib ES2021,DOM,DOM.Iterable` por la limitación preexistente de `replaceAll` en ES2020. Compilación de producción correcta; conserva advertencias previas de chunks grandes. ESLint comparado con HEAD no añade diagnósticos en archivos modificados; archivos nuevos comprobados aparte. `git diff --check` sin errores. No se afirma que toda la suite histórica del repositorio esté verde.

No requiere SQL, no cambia fuentes/cálculos/permisos ni acredita despliegue productivo. No se comprobó cada combinación de formulario, teclado virtual, teléfono físico o importe extremo. El atlas no se sincronizó: faltan su índice/mapa y `obsidian-sync.local` en este clon; se consultó el contexto del repositorio principal sin modificarlo. Las notas curadas no equivalen a adelantar su checkpoint.

---

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

# Design QA — Órdenes de servicio

Date: 2026-09-25. New operational workspace: Órdenes / Productividad / Cumplimiento. Ventas, Planificador and Comisiones remain outside the functional change. Charts are retained for future cross-module reuse; no future analytics destination is published now.

- Uses the shared compact header, filters, tabs and lists. No permanent explanatory paragraphs in the new views or order drawer. The reused compliance chart's concise mode removes redundant explanations while retaining values and its color legend; existing consumers keep their default presentation.
- Browser inspection used real components and synthetic data at `http://127.0.0.1:5181/mobile-review.local/orders.html`, never production rows. Órdenes and Productividad were visually checked at 390 px, Cumplimiento at 320 px, and Órdenes at 1280 px. Screenshots were inspected inline, not saved as repository artifacts.
- Document scrollWidth equaled clientWidth in measured states at 320/390/639/640/768/1280 px. The 639/640/768 checks are width measurements, not complete visual certification. A browser interruption affected one intermediate batch and the final compliance screenshot; its final text removal was verified with a DOM snapshot and regression tests.
- 93 targeted tests pass across 11 files, including source completeness, date identity, zero/negative values, inactive technicians, full export payloads, permissions, responsive order columns, Sales mobile and Planner regressions. Type check passes with ES2021 libraries, new-file lint passes, and production build succeeds with existing large-chunk warnings. Full repository suite, live downloads in every view, production permissions/data and physical touch devices were not certified.
- SQL is delivered separately for manual execution. This local implementation and its Git publication do not prove that Lovable has applied the migration or that Obsidian was synchronized.

Loading regression follow-up, 2026-09-25: the original loader fixture incorrectly supplied an `id` absent from the imported OS table. This invalidated its database-schema coverage, despite the passing visual/component checks above. A migration-backed query double reproduced the missing-column failure; the loader now selects/orders/unions by the actual `os_numero` primary key and preserves that identity in details and exports. All 60 targeted tests in eight files pass after the fix, including pagination beyond 1,000 OS, overlap of both date queries, branch prefixes and leading zeros. No visual layout, permissions or database data changed. This follow-up does not certify live production loading.

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

---

# Design QA — Service orders visual alignment

Date: 2026-09-25. Scope: Orders, OS drawer, Productivity, Compliance and Activity in `/servicios/ordenes`. Reference: the user's five supplied screenshots, the existing SIG CDM operational tables/import detail, and knowledge notes 24/25/26. The Product Design audit identified inconsistent composition, not a need for a new brand or global redesign.

## Five-step review and correction

| Step | Evidence and finding | Implemented correction |
| --- | --- | --- |
| Orders list | Supplied image 1 and local baseline: bare table, oversized row buttons, detached count/sort toolbar and vertical overflow arrows on the tab strip | Existing bordered table surface, 44 px desktop rows, neutral OS references, restrained state badges, aligned KPIs/filters and full-width tab strip |
| OS detail | Image 2: long ungrouped key/value list, raw ISO dates and amounts without currency | Three groups using existing import-detail primitives; localized dates, currency/decimals and preserved negative/zero/full invoice values |
| Productivity | Image 3: oversized rows, native select, empty goal columns and long warning competing with the table | Shared Select, contained compact tables, short missing-goal alert; unknown goal remains unknown and complete export retains its fields |
| Compliance | Image 4: a large single-bar legacy chart and disconnected blocks | Compact period summary using the original model counts/insights, complete period export, common panel treatment. Original chart implementation remains reusable |
| Activity | Image 5: absence rows visually resembling incomplete journeys, blank customer/TR | Separate availability table with technician, period and reason; complete activity export still includes absence rows and distinct same-day journeys |

General health: the corrected section now reuses app typography, neutral surfaces, separators, shared controls and import-detail grouping. Compact phone identity/context rows are intentional; tablet/desktop body cells remain columnar. No data models, source queries, access policy or financial population changed. This is a focused visual/code review, not a complete accessibility, production-data or whole-app audit.

## Local browser evidence

Real `AppLayout` and page/components with an ignored, synthetic local harness: `http://127.0.0.1:5181/mobile-review.local/orders.html`. Sources and auth are mocked; no customer exports or production session are used. `?missing-goal` exercises unknown capacity. Browser: in-app browser. Screenshots were inspected inline during this run; user commercial screenshots were not copied into the repository.

- 1280 × 900: Orders, grouped drawer, Productivity, missing goal, Compliance summary/matrix and Activity composition.
- 768 × 900: Orders with intermediate columns, 44 px body rows, no horizontal document overflow; tab clientHeight equals scrollHeight (31 px).
- 640 × 900: Productivity with capacity, all summary columns and one-line table values; narrow headings can wrap. Document scrollWidth equals clientWidth.
- 390 × 844: all three views, grouped drawer, Activity/Availability and compact period summary. No wide matrix on phones. Data still available through existing list/detail paths.
- 320 × 780: Productivity and Orders, including a long synthetic customer name. The name uses multiple lines; state stays in its own column. Three KPI values share the same baseline after shortening the mobile open-order label; document width is 305 px excluding the scrollbar, with no horizontal overflow.
- 639 × 844: breakpoint measurement, no horizontal document overflow, tab clientHeight equals scrollHeight (44 px). React resize rendering was allowed to settle before treating captures as evidence.

Some first screenshots immediately after viewport changes were stale/cropped; final settled screenshots and DOM measurements were used instead. Returning to desktop also required a clean reload to restore the matrix after the viewport override; its final desktop state was verified after reload, not treated as proof of live device rotation. Full-page stitching repeated content in one capture; row identity/count were verified in the DOM and tests rather than inferred from that bitmap. Moving formatting helpers caused transient HMR import errors; subsequent clean navigation and final builds use the corrected imports. No pixel-perfect or physical-device claim.

## Checks and boundaries

- 77 tests passed in 11 files: service-orders sources/model/formats, page integration, access, OS metrics/branch identity/technician matching, legacy table ordering, shared export and mobile Sales.
- New assertions cover grouped fields and signed currency, one set of three KPIs, unknown-capacity columns/export, absence separation without same-day deduplication, original compliance counts/export and no permanent explanatory paragraphs.
- Type checking passes with `--lib es2021,dom,dom.iterable`; the repository's default ES2020 `replaceAll` limitation is unchanged.
- ESLint passes for the edited/new section files. `DashboardCharts.tsx` still has its existing four errors and four warnings; running ESLint against `git show HEAD:...` confirmed the same diagnostics before this change. The only shared-component change is an optional `concise` prop; no hook behavior was rewritten here. This is not a clean whole-repository lint claim.
- Production build passes with existing large-chunk warnings. No SQL, migration, configuration or production writes. Excel payloads are tested; not every workbook was downloaded manually.
- Knowledge note 26 records the reusable visual decisions. This checkout has no Obsidian sync configuration/scripts; no vault synchronization is claimed.

Result: corrected and verified locally within this scope; user/production acceptance remains separate.

---

# Design QA — OS information and closure indicators

Date: 2026-09-25. Follow-up scope: the user's two OS screenshots and explicit changes to title, cards, equipment/technician/distance columns, drawer and lower summary. Existing visual primitives remain in use; no global restyling or new dashboard.

- Removed the page date subtitle and lower State/type/branch distribution. Date filters remain available.
- Five Order KPIs, in one desktop strip and two phone rows (3 + 2). Other tabs retain three. Closure percentage uses closed / all filtered orders. Average days use valid opening-to-invoice pairs, including true zero days, never the operational closing date as a substitute.
- Desktop list: OS, client, brand, model, technician count, status, OS hours, distance. At 640–1023 px brand/model share a single line and technician names/count stay in the complete drawer/export, as secondary columns are reduced. Short Hours/Km and Days average labels avoid clipped narrow headings. Phone records expose count, hours and distance without technician names; names remain in the drawer and complete export.
- The drawer adds imported equipment model, invoice date and individual closure days. It removes the ambiguous imported billing-status display. No data is deleted; the 25-column export retains that original field with an explicit source label.

Browser: existing ignored synthetic harness at `http://127.0.0.1:5181/mobile-review.local/orders.html`, real AppLayout and section components. Inspected screenshots at 1280×860, 390×844, 320×780, 640×860 and 768×860, including the 320 px drawer. At 320, the five KPI values occupy two aligned rows, and document width remains 305 px excluding scrollbar. At 640/768, scrollWidth equals clientWidth (625/753 px); rows remain 44 px at 768. Long synthetic customer names wrap only on phones. Some captures retain a prior vertical scroll position after resizing; they are not treated as full-page/header evidence. No production data or physical-device certification.

Verification: 100 tests in 12 files; changed TypeScript lint, ES2021 typecheck and production build. Existing router future warnings and large build chunks remain. Source-error, permission, pagination, original OS metrics and Sales-mobile regressions still pass. Pure tests cover absent/invalid/reversed dates, same-day zero, leap/year boundaries and model source precedence; integration checks cover all six widths 320/390/639/640/768/1280, list filtering, new KPI population, names hidden in list and complete export. No SQL or changed access rules. Knowledge note 26 updated; this checkout still lacks Obsidian sync configuration/scripts.

Result: implemented and verified locally; deployment and live source-date quality are not certified by these checks.

---

# Design QA — Productivity goal, progress and technician tabs

Date: 2026-09-25. Existing app, not a new dashboard. Shared Parameters/OS goal reader replaces the misleading 132 fallback. The cause confirmed is the divergent error handling; the live Cloud failure (missing schema, RLS, missing row or connection) has not been queried. Manual migration prepares restricted access/provisioning without seeding or overwriting a goal; not executed by the agent.

Productivity has visible Todos/Activos/Inactivos/Sin ficha tabs. Selection scopes KPIs, technicians, period totals and exports, retaining unique OS and participant-attributed hours. Bars are zero-based and use the app's primary color plus numerical percentages; >100% remains explicit, while absent targets have no bar. Phone rows group identity/OS/state and show hours/target/progress in the numeric column. Desktop values remain single-line; abbreviated tablet headings do not alter Excel labels. No permanent explanatory paragraph was added.

Browser checks use the existing ignored fixture harness, not live sources. Screenshots inspected at 390×844, 320×780, 1280×860, 768×860 and 640×860; synthetic examples include 70.7%, 108.3% and larger excesses, inactive technicians and missing goal. 320/390/768 document scrollWidth equals clientWidth; desktop/tablet tabs align left with hidden overflow (an initial screenshot caught vertical scroll arrows, corrected before completion). The first post-click capture included animation/stale viewport state; settled captures/DOM were used. Active tab reduces the visible team without changing the other main sections. Missing-goal mode keeps known hours and the retry action, without empty target columns. No physical device, virtual keyboard, deployed Cloud or real-user data claim.

Validation: 96 passing tests across eight files, ES2021 typecheck, targeted lint and production build. Covers goal-source errors/no default, Parameters persistence/invalidation, scoped KPI/list/export values, multiple participants, deactivation proration, real percentages over 100%, absent targets and existing OS regressions. Existing React Router future and large-build-chunk warnings remain. SQL policies have static contract coverage only, not an executed PostgreSQL test. Knowledge note 26 updated; no configured Obsidian sync in this checkout.

## Follow-up — missing setting and compact status control, 25/09/2026

The user reported zero rows from the exact goal-key query in Cloud and confirmed the monthly base as 132 hours minus unavailability. No additional RLS changes or automatic default on read failure. Settings writes now require readback through the shared reader before reporting success. A 132-hour save was submitted through the existing published Parameters UI; confirmation from the current preview is pending, separate from local tests.

Removed the second full-width tab row inside the technician panel. A single header contains the title and compact segmented status buttons using the existing Sales switcher's selected-color/border treatment. On phones, the redundant title is omitted; four equal-width controls keep 44 px targets. Main page tabs, filter semantics, exports and progress bars remain unchanged.

Local synthetic harness screenshots inspected at 1280×860, 320×780 and 768×860. At 320, all four controls measure approximately 65.6×44 px; document scrollWidth equals clientWidth (320). At 768, both widths are 768; Active selection shows the single fixture technician and updates KPI/period totals. Viewport override reset after inspection. No production screenshot or customer data saved in the repository.

112 tests passed across nine files, including new save/readback failures, missing-row entry, 132-hour absence deductions, overlap protection and common KPI/list/period targets. ES2021 types, targeted lint and production build passed, with existing router/chunk warnings. No new SQL required by the code change; no Obsidian synchronization claimed.
