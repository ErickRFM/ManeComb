# Remaining Closure Plan

No se proponen refactorizaciones adicionales en esta fase.

La coherencia local se cierra con validacion estatica, pruebas y build. La certificacion de produccion requiere evidencia separada para:

1. dos o tres dispositivos fisicos transmitiendo/recibiendo y diez ciclos consecutivos;
2. WiFi/LTE, background, pantalla bloqueada y reconexion;
3. Bluetooth, cable, altavoz y competencia de AudioFocus;
4. dos instancias backend para demostrar arbitraje global;
5. decision explicita de compatibilidad Web: aceptar notas de voz o implementar PTT web real en otra fase autorizada.

Hasta completar esas pruebas no corresponde declarar certificacion fisica ni de produccion.
