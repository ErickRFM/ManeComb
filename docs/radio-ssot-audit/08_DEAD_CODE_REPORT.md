# Dead Code Report

Se eliminaron durante las fases de estabilizacion:

- reducer y acciones de metricas Radio;
- playback paralelo y timers de guardia;
- estado local duplicado de canal/sesion/conexion;
- segundo socket y eventos `radio:busy`/`radio:leave`;
- indicadores de senal y promedios no medidos;
- derives de READY/ERROR/OFFLINE;
- animaciones y callbacks manuales reemplazados por lifecycle de fase.

La ruta Web MediaRecorder, las rutas HTTP de historial, los estilos hover Web y el player generico usado por Chat tienen consumidores comprobables y no son codigo muerto de Radio.

Las busquedas vigentes no encuentran consumidores Radio de los estados retirados. La compilacion y ESLint son la verificacion estatica final de imports, tipos y callbacks.
