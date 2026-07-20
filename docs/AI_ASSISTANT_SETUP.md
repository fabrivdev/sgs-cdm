# Asistente de datos con Kimi

El asistente se ejecuta en una Supabase Edge Function. La API key nunca se guarda en el frontend.

## Despliegue

Desde la raiz del repositorio:

```powershell
npx supabase login
npx supabase link --project-ref tgwoqdsrbomuwfanhuzp
npx supabase db push
npx supabase secrets set MOONSHOT_API_KEY=TU_API_KEY
npx supabase secrets set MOONSHOT_MODEL=kimi-k2.5
npx supabase functions deploy ai-data-assistant
```

`MOONSHOT_MODEL` es opcional. El codigo usa `kimi-k2.5` por defecto porque es el modelo publicado actualmente por Moonshot. Cuando exista un identificador oficial de K3, basta con actualizar este secreto sin modificar la app.

## Verificacion

1. Iniciar sesion con un usuario administrador.
2. Abrir el boton flotante del asistente.
3. Crear una consulta breve sobre trabajos del periodo visible.
4. Confirmar que la respuesta muestra fuentes y filtros.
5. Iniciar sesion como tecnico o cabecilla y confirmar que el boton no aparece.

## Seguridad

- Solo los administradores pueden invocar la funcion.
- Las consultas de datos se ejecutan con el JWT del usuario y respetan RLS.
- No se acepta SQL ni se exponen tablas arbitrarias.
- Las conversaciones son privadas por usuario.
- La service role se usa solo para validar rol, limites y auditoria interna.
