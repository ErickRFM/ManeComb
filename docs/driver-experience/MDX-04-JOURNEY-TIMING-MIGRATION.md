# MDX-04 — Compatibilidad y migración de tiempos de Jornada

## Estado

`IMPLEMENTED_NOT_APPLIED`

## Problema

`RouteSession.startedAt` se utilizó históricamente como inicio real y, en estados futuros `ASSIGNED`/`READY`, podía confundirse con el horario programado.

La Jornada necesita separar:

- `scheduledStartAt`: horario programado por administración;
- `scheduledEndAt`: final programado;
- `startedAt`: inicio real confirmado por backend;
- `finishedAt`: final real.

## Solución

Se añadió una capa de compatibilidad:

```text
backend/src/domain/journey-session-compatibility.js
```

La lectura:

- conserva `startedAt` para jornadas `RUNNING`, `PAUSED`, `FINISHED` y `CANCELLED`;
- detecta `ASSIGNED`/`READY` legacy con `startedAt` y sin `scheduledStartAt`;
- expone `legacyTiming` para que el caso no se oculte;
- no inventa fechas inválidas;
- normaliza fechas ISO.

## Migración

```text
backend/scripts/migrate-journey-session-timing.js
```

### Dry-run

```bash
cd backend
node scripts/migrate-journey-session-timing.js --dry-run
```

### Aplicación explícita

```bash
cd backend
node scripts/migrate-journey-session-timing.js --apply
```

## Reglas

| Caso | Acción |
|---|---|
| `ASSIGNED/READY` + `startedAt` + sin `scheduledStartAt` | mover a `scheduledStartAt`, limpiar `startedAt` |
| `RUNNING/PAUSED/FINISHED/CANCELLED` + `startedAt` | conservar inicio real |
| documento ya migrado | no modificar |
| fecha inválida | no inventar valor |

## Seguridad

- dry-run por defecto;
- `--apply` obligatorio para escribir;
- `--apply` y `--dry-run` juntos fallan;
- no se importa desde `src/server.js`;
- usa `MONGO_URI/MONGODB_URI` y `MONGO_DB_NAME` explícitos;
- operación idempotente;
- validación posterior obligatoria;
- no toca posiciones, métricas, eventos, incidencias ni rutas.

## Checks

| Check | Estado |
|---|---|
| Compatibilidad legacy | PASS en prueba aislada |
| Jornada nueva sin `startedAt` | PASS |
| Jornada iniciada conserva `startedAt` | PASS |
| Fechas inválidas fallan cerradas | PASS |
| Migrador dry-run por defecto | PASS por inspección |
| Migrador idempotente | PASS por contrato |
| Aplicación en base real | PENDIENTE |
| Backup previo | PENDIENTE |
| Conteos antes/después | PENDIENTE |

## Condición para aplicar

No ejecutar `--apply` hasta que:

1. el esquema acepte los campos nuevos;
2. embedded store y Mongo store persistan el mismo contrato;
3. endpoints lean mediante la capa de compatibilidad;
4. exista respaldo de la colección;
5. el dry-run se revise y documente;
6. CI esté verde en el SHA exacto.

## Veredicto

```text
MDX_04_COMPATIBILITY_READY
MDX_04_MIGRATOR_READY
DATABASE_NOT_MODIFIED
DO_NOT_APPLY_YET
```
