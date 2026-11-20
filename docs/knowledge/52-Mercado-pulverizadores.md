# Mercado de pulverizadores

Ruta `/mercado/pulverizadores`. El tablero sigue el mercado paraguayo de autopropulsados para mantener el alcance de OCIT Pulverizadores. Incluye unidades, FOB, participación con referencia interanual, marcas, modelos, tanques, precios, importadores e historia. Compara estado por año y ofrece filtros de ancho de barra y potencia.

El gráfico y la pestaña Tanques agrupan la capacidad nominal en litros. Se prioriza el tanque declarado de la máquina sobre las fichas por modelo y se distingue del caudal de la bomba. Las barras solo se clasifican cuando el ancho declarado o las opciones verificadas caen en una banda común. Se conserva un valor desconocido cuando no hay evidencia suficiente. La potencia expresada en kW o CV se convierte a HP.

- La carga inicial usa `OCIT_Pulverizadores.xlsx` y `detalle_PYimport_2026-10-4-164047.xlsx`. La cobertura de esas fuentes va de 2019 a septiembre de 2026.
- Administración → Datos → Mercado · Pulverizadores acepta después un solo Excel original de Penta/PYimport completo para el período. El RPC reemplaza el período declarado y conserva los demás. El código de referencia es `84244900000A`. El importador verifica que las declaraciones correspondan a equipos autopropulsados y excluye arrastre, drones, repuestos y sistemas de riego.
- La sección `mercado.pulverizadores` regula el acceso al tablero. La migración `20261120150000_mercado_pulverizadores.sql` crea la tabla y habilita el reemplazo por período con el permiso de Administración → Datos.

HORSCH es la marca de referencia. El modelo Leeb 5.280 VL se normaliza según [HORSCH Paraguay](https://cdn.horsch.com/celum/50255_original.pdf).

Las capacidades de los modelos incorporados se contrastan con [Case IH Patriot](https://www.caseih.com/pt-br/brasil/produtos/pulverizadores/patriot-50), [John Deere](https://www.deere.com.br/pt/tratos-culturais/), [Jacto Uniport 4530](https://jacto.com/brasil/agriculturalmachines/self-propelled-sprayer/uniport-4530) y [Valtra R535](https://www.valtra.com.br/produtos/pulverizadores/pulverizadores-serie-r.html).

En despachos con cantidad agregada y descripción de una unidad, se usa la cantidad del equipo descrito y se conserva el FOB de la declaración. Para los Deere 4730 y R4038 usados sin cantidad explícita se contrasta el peso neto con los registros de una sola máquina antes de aplicar la misma corrección.
