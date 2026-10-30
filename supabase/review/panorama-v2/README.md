# Ampliación de fuentes de Panorama — aplicada

Aplicada el 21/10/2026 en SIG CDM, proyecto Lovable `7c439c1a-a281-4122-938b-166c9a77b41b`, en el orden Clientes, Pedidos, Repuestos. Cada editor devolvió `Query succeeded`. No se importaron archivos ni se modificaron registros de negocio. No usar el archivo agregado anterior, marcado obsoleto.

Antes de aplicar se exportaron del servidor las definiciones exactas de las dos funciones reemplazadas y de las dependencias de Clientes. Las copias `*.live-before.sql` y `*.live-reference.sql` coinciden con los cuerpos preparados; las guardias MD5 se fijaron sobre esos bytes. Hashes anteriores: Pedidos `d5092278bcadc2c732df90cd7c4654fd`, Repuestos `205b042a2a24a5875d99893ae58dffe1`. Hashes verificados después: Clientes `3f4ffd1b6bc720d7633741652e0aa1ae`, Pedidos `e24d4e37b893638853c92ef7d1d529cd`, Repuestos `473aaf1d27b6a51af89a06da2b18f5ac`. Owner, SECURITY DEFINER, search_path, timeout y ACL se comprobaron después; la nueva función de Clientes excluye `anon` y `PUBLIC` de EXECUTE. Los `*.rollback.sql` contienen las definiciones anteriores y guardias de versión; no se ejecutaron.

| Unidad | Firma exacta | Efecto | Seguridad |
|---|---|---|---|
| Clientes | public.campi_clientes_cohortes_v1(date,date,date,date,text DEFAULT 'TODAS') RETURNS jsonb | Nueva función: IDs separados para cohorte base, actual, retenidos, propietarios y propietarios con compra. No modifica resumen ni fuente. | Roles superadmin/admin/gerencia; mismo control módulo (excepción superadmin) y sección. EXECUTE nueva función authenticated/service_role; PUBLIC/anon excluidos. Fuente interna sigue privada. |
| Pedidos | public.campi_pedidos_abastecimiento_v1() RETURNS jsonb | Reemplazo compatible: agrega pedidos_completos con clasificación explícita. Contrasta tamaño de grupo con stock listo para evitar poblaciones distintas. | Conserva cuerpo de autorización, timeout 45s, SECURITY DEFINER y ACL existentes. |
| Repuestos | public.campi_repuestos_exposicion_v1() RETURNS jsonb | Reemplazo compatible: agrega tramos_compra y transiciones; reutiliza CTE materializada existente y suma ubicaciones por código. | Conserva autorización, timeout 90s, SECURITY DEFINER y ACL existentes. |

Cada unidad tiene apply, validate y rollback. Las guardias MD5 ya están fijadas. Clientes usa CREATE sin reemplazo y rechaza la firma anterior de cuatro argumentos. No cambiar owner, RLS ni ACL de dependencias. La nueva función expone IDs a los mismos roles autorizados del resumen. El frontend de la rama alternativa ya consume las tres ampliaciones con validación de cardinalidades y conservación del KPI previo cuando falla un desglose opcional.

## Clientes y desglose

Reutiliza directamente gerencial_clientes_movimientos_posventa_v1: conserva identidad, moneda, signo y deduplicación de contratos COHORTES/COBERTURA. Mantiene netos positivos por ventana, filtros de sucursal respectivos y propietarios activo verdadero o null. No deriva ambos KPIs de una única lista booleana.

La fuente vigente no devuelve rubro. No basta con sumar dos listas por Servicios/Repuestos: con +100 en Servicios y -100 en Repuestos, la compra conjunta neta es cero aunque Servicios sea positivo. Contar la unión de netos positivos por línea alteraría el KPI. Propuesta futura: conservar el denominador de propietarios y el conjunto de compradores netos; mostrar entre ellos pertenencias por línea no aditivas y su solapamiento, sólo después de definir y preservar rubro en una fuente privada. No cambia ni se abre esa fuente en este paquete. desglose_lineas queda null con estado explícito.

## Validación y límites

Ejecutar node scripts/verify-panorama-expansion.mjs: PostgreSQL en memoria, sin conexión remota; definiciones reales de fuente y resumen con fixtures. Cubre NC que anula compra, moneda, supresión de duplicados por fecha/sucursal, identidades, propietario null-activo, roles, excepción de módulo de superadmin, sección, anonimato, ACL privada, paridad completa del payload anterior de las dos funciones, cuatro categorías, transiciones, guardias y reversión. Los helpers de autenticación y normalización son fixtures; no certifica permisos reales ni rendimiento productivo.

Los scripts validate contienen preflight y consultas posteriores. Antes de revertir, confirmar que la función sigue siendo la versión de este paquete para no sobrescribir trabajo ajeno. Ningún script de reversión se ejecutó en remoto. No volver a ejecutar los apply sin un nuevo cotejo de versiones.

Verificación autenticada en la rama alternativa: Clientes mostró 31 propietarios con compra de 211 y 180 sin compra en la ventana; Pedidos mostró 11 pedidos, 4 con stock completo, 2 parcial y 5 sin cobertura; Repuestos mostró USD 1.128.358 de stock gris/rojo, con USD 845,9 mil de más de 1.000 días y USD 282,4 mil de 366–1.000 días, y 32 códigos / USD 8.981 con cambio condicional de clasificación a 30 días. Los resultados son lecturas del 21/10 y pueden cambiar. Solo se verificó con una sesión administradora; faltan cuentas de prueba con permisos limitados. La vista de preferencias se restauró sin guardar cambios. Panorama sigue sin publicarse en `main` o Lovable público.

## Ventas: qué acredita la evidencia

- Máquinas: dos cargas activas COMPLETADO, 1579 filas; extremos declarados 05/02/2010–30/06/2026. Acredita existencia de cargas históricas y el mecanismo de selección, no continuidad ni cada mes anual por área. No habilita automáticamente enero de todos los años.
- Facturación tiene filas por año 2010–2026; líneas, 2018–2026. Acredita movimientos presentes y disponibilidad de historia, no ausencia de meses faltantes ni conciliación anual por área.
- Repuestos pre-julio usa v_ventas_repuestos_historico_completo sobre líneas importadas; Máquinas usa cargas completadas; el corte fuente histórico/actual es julio de 2026. Preservar esa separación; no deducir cobertura de una única primera fecha.
- 818 líneas sin fecha_factura quedan como incidencia sin asignación temporal. No rellenar fecha ni repartir entre meses.
- No hay todavía un período anual completo por área certificado mediante esta evidencia agregada. Para acreditarlo faltan metadatos por carga/área y conciliación por mes con fuente nativa; no es un bloqueo para preparar series disponibles con completitud explícita.
