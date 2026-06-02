Dos cambios puntuales:

1. **Quitar Dashboard para técnicos**
   - `src/App.tsx`: cambiar `requireRoles={["admin", "tecnico"]}` de la ruta `/dashboard` a `requireRoles={["admin"]}`. Los técnicos no podrán acceder por URL.
   - `src/components/AppLayout.tsx`: cambiar la lógica de visibilidad del item "Dashboard" en `navItems` para que solo aparezca cuando `isAdmin` (actualmente se oculta solo a cabecilla; ahora también a técnicos). Mantener el resto del menú igual.

2. **Filtrar Trabajos por sucursal del técnico por defecto**
   - `src/pages/Trabajos.tsx`:
     - Importar `useAuth` y leer `isAdmin`, `isTecnico`, `profile`.
     - Inicializar `fSucursal` con la sucursal del perfil cuando el usuario es técnico (y no admin) y tiene `profile.sucursal`; en cualquier otro caso mantener `"all"`.
     - Usar `useEffect` para setear el filtro cuando se cargue el `profile` (porque al primer render puede estar nulo).
   - No tocar permisos en backend ni RLS; es solo el filtro por defecto de la UI.