# Tarjeta sin conexión: que no la tape el error "Actualizar"

## Qué pasa hoy

Al perder internet aparece tu tarjeta unos segundos y después la reemplaza la pantalla gris "No se pudo cargar esta vista / Actualizar".

Esa segunda pantalla no es una versión vieja del diseño: es el manejador de errores general de la app. La tarjeta animada usa un motor 3D pesado (física, texturas, modelo de la credencial) que se descarga por partes bajo demanda. Sin internet esas descargas fallan, el fallo sube hasta el manejador de errores global y este tapa toda la app, incluida la tarjeta.

## Qué se va a hacer

1. **Aislar la animación 3D**: envolverla en su propio manejador de errores local. Si el motor 3D o sus imágenes no cargan, se muestra la tarjeta estática (la versión sin animación que ya existe) en lugar de romper la pantalla completa.
2. **No intentar el 3D si no está listo**: solo se activa la versión animada cuando el motor y sus recursos ya se descargaron con éxito estando online. Si la conexión cae antes, se va directo a la tarjeta estática, sin parpadeo ni salto.
3. **Mejorar la tarjeta estática** para que se vea como la versión animada (mismo formato, cordón, logo y textos "SIN CONEXIÓN A INTERNET"), así la experiencia es consistente en cualquier caso.
4. **Precargar los recursos correctamente** mientras hay internet (modelo, texturas e imágenes de la tarjeta), para que la versión animada aparezca en la mayoría de las caídas de señal.

Resultado: al irse la señal siempre se ve tu tarjeta, nunca el cartel "Actualizar la página".

## Detalle técnico

- `src/components/offline/OfflineExperience.tsx`: agregar un `class` error boundary local (`Lanyard3DBoundary`) alrededor del `Suspense`+`Lanyard`, con `StaticCredential` como fallback; también capturar el rechazo de `loadLanyard()` (`.then/.catch` en un estado `lanyardReady`) y solo renderizar el 3D si `lanyardReady === true` y hay WebGL.
- Precargar assets del 3D mientras hay red: `useGLTF.preload`/`useTexture.preload` vía el módulo ya importado, más las imágenes SVG/PNG actuales.
- El `ErrorBoundary` global de `src/App.tsx` no se modifica; deja de dispararse porque el error queda contenido.
- Estilos de la tarjeta estática en `src/components/offline/offline-experience.css` para acercarla al diseño de la credencial.
