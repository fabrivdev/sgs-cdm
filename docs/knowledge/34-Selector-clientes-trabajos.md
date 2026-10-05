# Selector de clientes en Trabajos

Preparación local del 03/10/2026 sobre `2340fbae6daaecdf13da065883239ee76a1a87db`. No implica publicación ni validación productiva.

## Comportamiento y alcance

- `NuevoTrabajoDialog.tsx` conserva el `cliente_id` real guardado al abrir una edición. La representación agrupada nunca reemplaza automáticamente la relación. El nombre mostrado corresponde a ese mismo ID, incluso ante un refresco del trabajo. Si el registro no está disponible en el catálogo, se conserva la relación y se informa sin inventar un nombre.
- `TrabajoClienteInput.tsx` busca todos los nombres originales, RUCs y códigos del maestro recibido. Muestra una opción por identidad compatible, con el nombre que coincide y sus otros nombres. Filtra antes de limitar a 100 resultados; no filtra por sucursal ni por pertenencia al Parque. Conserva texto libre para nombres realmente nuevos.
- Seleccionar una coincidencia usa un ID real de la fila cuyo nombre se muestra. Un nombre escrito sin seleccionar también se resuelve contra todas las filas y sus nombres canónicos antes de crear. Para nombres iguales se prefiere el ID ya vinculado; en altas nuevas se prefiere una fila con RUC, luego código, con desempate estable. Escribir un RUC/código exacto también reutiliza la identidad cuando es inequívoca.
- `workClientSelection.ts` reutiliza la agrupación histórica de forma local al selector, sin modificar `clientIdentity.ts` ni sus demás consumidores. Distingue el namespace RUC del código. Cuando un grupo contiene RUCs no vacíos y distintos, separa las candidatas para exigir una elección explícita; una fila sin RUC no sirve como puente entre esos conflictos. No separa empresas que comparten un mismo RUC sólo por tener nombres diferentes.
- Antes de insertar un nombre aparentemente nuevo, se relee el maestro visible bajo los permisos vigentes, paginado y ordenado por ID. Un fallo de lectura detiene el alta. No se amplían permisos ni se consulta una credencial privilegiada.
- El formulario no pierde la edición al refrescar el catálogo. Se reinicia al cerrar/reabrir o cambiar de trabajo. La selección resaltada por teclado se identifica por ID y no por posición. Escape cierra primero las sugerencias; `ResponsiveDrawer` incorpora únicamente un callback opcional para ese caso y conserva su comportamiento por defecto.
- Durante un guardado se bloquean nuevos guardados y el cierre por el formulario. Si el controlador externo cambia de sesión durante una respuesta tardía, no se sobrescribe ni cierra el nuevo formulario. Un alta de cliente completada antes de fallar el trabajo se conserva para el reintento y para nuevas búsquedas en la sesión, evitando repetir esa alta.
- Se conserva la sincronización del servicio legado, la compatibilidad de la columna OS y el resto de campos del trabajo. No se modifican programación, jornadas, técnicos, fechas, horarios, SQL ni otros módulos de negocio.

## Verificación y límites

Pruebas en `src/lib/workClientSelection.test.ts` y `src/components/trabajos/NuevoTrabajoDialog.test.tsx`: identidad original, alias ocultos, nombre/RUC/código, conflictos, paginación, catálogo desactualizado, errores, cancelación/reapertura, teclado, refrescos y respuestas tardías. Componentes reales con API simulada y datos ficticios; ningún guardado productivo.

La suite completa se ejecuta con `TZ=UTC`: la base tiene una prueba de exportación de fechas sensible a la zona del host. El typecheck de la base requiere `--lib ES2021,DOM,DOM.Iterable` por tres usos existentes de `replaceAll` en `localizedAmount.ts`; no se cambia esa configuración como parte de este arreglo. El lint global conserva errores ajenos al alcance; los archivos modificados pasan lint.

El navegador cloud bloqueó la página local de prueba con `ERR_BLOCKED_BY_CLIENT`, por lo que no se afirma validación visual en navegador, móvil físico ni producción autenticada. La lectura previa y el bloqueo local no garantizan unicidad entre dos sesiones concurrentes: no se agrega una restricción ni una transacción en la base de datos. Tampoco se corrigen relaciones históricas por abrir el formulario.

Este clon no contiene `00-Inicio.md`, `mapa-negocio.json` ni `obsidian-sync.local`. Se contrastaron las notas disponibles con el código; no se acredita actualización del atlas ni sincronización de Obsidian.
