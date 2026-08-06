# Versionado de ManeComb Mobile

La versión de la aplicación móvil tiene una sola fuente de verdad:

```text
mobile/app.json
```

Ejemplo actual:

```json
{
  "name": "main",
  "displayName": "ManeComb",
  "version": "1.1.0",
  "buildNumber": 19
}
```

## Campos

- `version`: versión pública en formato SemVer `MAYOR.MENOR.PARCHE`.
- `buildNumber`: entero interno que siempre debe aumentar en cada APK/AAB nuevo.

Android toma ambos valores directamente desde `app.json`:

- `versionName` ← `version`
- `versionCode` ← `buildNumber`

La aplicación también reporta esos mismos datos al backend durante autenticación, por medio de `src/utils/version.ts`.

## Comandos

Validar la versión actual:

```bash
npm run version:check
```

Incrementar automáticamente versión y compilación:

```bash
npm run version:bump -- patch
npm run version:bump -- minor
npm run version:bump -- major
```

Definir una versión específica. Si no se envía el número de compilación, se incrementa automáticamente:

```bash
npm run version:set -- 1.2.0
npm run version:set -- 1.2.0 25
```

## Regla de publicación

- Corrección compatible: `1.1.0` → `1.1.1`.
- Función nueva compatible: `1.1.0` → `1.2.0`.
- Cambio incompatible o producto mayor: `1.x.x` → `2.0.0`.
- Cada APK/AAB nuevo incrementa `buildNumber`, incluso cuando la versión pública no cambia.

El catálogo del Mobile App Center debe actualizarse solamente cuando el APK de esa versión ya esté generado y disponible para descarga. Así no se anuncia una compilación inexistente.
