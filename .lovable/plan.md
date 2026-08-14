# Tarjeta sin conexión: hacer que sí aparezca la versión 3D

## Qué está pasando

La tarjeta 3D nunca llega a mostrarse sin internet. La causa está confirmada en los errores del preview: falla la descarga de `rapier.es-...js`, el módulo del motor de física (WebAssembly) que `@react-three/rapier` descarga **recién cuando se monta la física**, no cuando se importa el componente.

Hoy la precarga hecha mientras hay internet carga el componente `Lanyard` y las imágenes, pero **no** ese chunk de física ni el WASM. Por eso, al caer la conexión, la física intenta bajarse en ese momento, falla, el error boundary local salta y siempre vemos la tarjeta estática.

## Qué se va a hacer

1. **Precargar de verdad el motor de física mientras hay internet**: además del componente y las imágenes, descargar e inicializar el módulo de física (incluido su WebAssembly) para que quede en memoria/caché del navegador. Recién cuando eso termina bien se marca la versión 3D como disponible.
2. **Precargar el modelo de la credencial y sus texturas** (`card.glb`, imagen del cordón) con los helpers de preload, para que nada quede pendiente de red al momento del corte.
3. **Reintentar la precarga al volver la conexión**, de modo que si el usuario abrió la app justo sin señal, al reconectar quede lista para el próximo corte.
4. **Mantener el comportamiento seguro**: si algo de eso falla, sigue mostrándose la tarjeta estática actual (nunca el cartel "Actualizar la página").

Resultado: en un corte de señal normal (sesión ya abierta con internet) se ve la credencial 3D colgando y con física; la estática queda solo como respaldo real.

## Detalle técnico

- `src/components/offline/OfflineExperience.tsx`, en `ensureLanyardReady()`:
  - agregar `import("@dimforge/rapier3d-compat")` + `await RAPIER.init()` (la dependencia ya viene con `@react-three/rapier`) y `import("@react-three/rapier")` para forzar la descarga del chunk `rapier.es-*` estando online.
  - agregar precarga de assets del modelo: `useGLTF.preload(cardGLB)` ya existe en `Lanyard.jsx`, sumar `useTexture.preload` para `lanyard.png` y para las imágenes usadas en la credencial.
  - mantener `lanyardFailed` / listener `online` para reintentos.
- No se toca el `ErrorBoundary` global ni `src/App.tsx`.
- Verificación: simular offline en el navegador (Playwright, `context.set_offline(True)`) y comprobar que se renderiza el canvas 3D y no la tarjeta estática.
