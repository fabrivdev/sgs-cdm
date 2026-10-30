# Campi: carga inicial

La bienvenida vigente usa CampiOnboardingScene y welcome2d/CampiWelcomeActor. Esperaba tres atlas SVG ocultos antes de cargar el visor. El atlas de presentacion ya no se usa en el renderer V12 y los errores de esa precarga no tenian salida.

El cargador compartido solicita las tres imagenes necesarias en paralelo y espera su decodificacion antes de mostrar el primer frame. Reutiliza recursos decodificados entre bienvenida y badge, cancela callbacks al desmontar y conserva la carga compartida mientras quede un consumidor. Los errores y el timeout de 20 segundos permiten reintentar. El CTA de bienvenida sigue disponible; la secuencia comienza en cero cuando los recursos estan listos.

No cambian imagenes, geometria, camara ni actuacion V12/V5. La bienvenida pasa de 8.212.476 a 6.232.631 bytes unicos: 1.979.845 bytes menos (24,11%). Esto no es una medicion de velocidad de red. El badge mantiene sus tres recursos originales y aprovecha la cache compartida.

Validacion: 60 pruebas en siete archivos, TypeScript y build correctos; lint sin errores y una advertencia preexistente react-refresh/only-export-components en CampiBadgeActor.tsx. Se comprobaron recursos de public y dist identicos. Las pruebas cubren carga lenta, decode, error, timeout, reintento, consumidores simultaneos, cache, desmontaje, CTA y pausas.

No se verifico reproduccion visual ni la conexion de otro usuario: Computer Use permanece bloqueado. El usuario autorizo subir esta correccion a main; la publicacion en Lovable queda a su cargo. No SQL ni cambios de datos, cobertura, seguridad o solicitudes.