# Panorama: integración a main — 30/10/2026

Se retira el control temporal **Probar recorrido inicial**, su navegación de prueba y el estado de preview. La primera visita conserva la bienvenida V12, el selector real, la continuación de una selección pendiente y el guardado por usuario. Los usuarios con preferencias guardadas abren su Panorama y pueden editar prioridades normalmente.

La integración parte de main `17089e5c` y conserva Anular pedido, Stock proyectado, Ventas e importadores ya presentes allí. El checkout original se conserva; los cambios se concilian en la rama aislada `integration/panorama-20261030`. No se copian `.env.local`, ZIP de trabajo, snapshots de clientes ni resultados privados de consultas.

## Configuración y base de datos

Commit/push no publica Lovable ni aplica SQL. Se incluyen las migraciones y contratos de lectura necesarios para reproducibilidad, sin volver a ejecutarlos. La función unificada de cobertura y su corrección de enum ya fueron instaladas con autorización específica; el parche preserva ACL y fórmula. La validación visual de cobertura sigue reservada al usuario.

Las banderas locales no se suben como archivos de entorno. La cobertura unificada queda activa por defecto en toda compilación; sólo `VITE_UNIFIED_PARK_COVERAGE_ENABLED=false` la desactiva explícitamente. El fallback anterior por rubros usa `VITE_CAMPI_COVERAGE_RUBROS_ENABLED=true` cuando no está activa la fuente unificada. No se cambian estos gates silenciosamente ni se amplían permisos. Otros utiliza su contrato instalado y conserva cobertura parcial si falla.

## Límites de validación

Pruebas, lint, tipado y build se ejecutan sobre la copia aislada de integración. Las expectativas obsoletas del preview, del número de consultas y de la cuarta fuente de facturación se actualizan sin retirar comprobaciones de permisos ni cambiar cálculos.

Computer Use quedó bloqueado al no poder verificar la URL de Chrome con suficiente confianza. No se repite ni se elude ese control. La conformidad visual declarada por el usuario no se presenta como QA visual propia. Publicación pública: exclusivamente el usuario.

## Comprobación de la integración aislada

Build completado en 2m55s y tipado global sin errores. Lint focalizado: cero errores y una advertencia preexistente de Fast Refresh en la exportación `badgeMood`. La primera ejecución amplia detectó cuatro expectativas desactualizadas y dos timeouts de locomoción 3D; las seis suites afectadas por ajustes pasaron después con 48 pruebas, y la ejecución en serie de dependencias y locomoción terminó con 179 pruebas en 21 archivos, sin fallos. La suite inicial había aprobado las otras 70 suites. Estas comprobaciones no equivalen a ejecutar toda la suite del repositorio ni a QA visual nueva.

Cambio posterior autorizado para main: cobertura de todo el parque activo y activación por defecto. La migración de 43 aún no fue instalada por falta de vía SQL habilitada; instalarla antes de publicar el consumidor que exige la nueva política. Commit/push no sustituye esa instalación.
