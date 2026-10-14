# Arquitectura

## Cliente

Aplicación React y TypeScript, Vite, Tailwind y componentes shadcn/Radix. React Router organiza las páginas. React Query administra parte de las consultas; otras vistas usan llamadas RPC en efectos de React. Recharts presenta gráficos y XLSX participa en importaciones/exportaciones.

Fuente: `package.json`, `src/App.tsx`, `src/pages`, `src/components`, `src/hooks`, `src/lib`.

## Servidor y datos

Supabase aporta autenticación, PostgreSQL, RPC y Edge Functions. Las migraciones están en `supabase/migrations`. La presencia de un archivo SQL en Git NO demuestra que haya sido ejecutado en la base.

Las Edge Functions cubren administración de usuarios, extracción documental y asistente de datos. El inventario actualizado está en [[10-Mapa-del-codigo]].

## Módulos

- Servicios: planificación, trabajos, calendario, comisiones, dashboard y ventas.
- Parque: clientes, máquinas, stock, operaciones/pedidos, importaciones y ventas.
- Repuestos: stock, compras, sugerencias y ventas.
- Administración: usuarios, importaciones de datos y parámetros.

Varias rutas comparten página: ParqueClientes sirve clientes/máquinas/stock; MaquinariaOperaciones sirve operaciones/importaciones; Ventas elige el área comercial.

## Fuentes de verdad

Código vigente para comportamiento local; definiciones reales de PostgreSQL para ejecución en producción; archivos originales para contrastar importaciones; documentación para intención y acuerdos. No mezclar estos niveles de evidencia.
