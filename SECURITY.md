# Política de seguridad de ManeComb

**Responsable del repositorio:** Erick Rivaldo Flores Maza (`@ErickRFM`).

## Principios de acceso

- `main` debe tratarse como rama protegida y de integración final.
- Los cambios deben entrar mediante Pull Request y pasar los checks aplicables antes de mergear.
- El acceso de escritura debe concederse con privilegio mínimo y revisarse periódicamente.
- No deben almacenarse secretos, tokens, contraseñas, llaves privadas ni credenciales reales dentro del repositorio.
- Las cuentas con acceso administrativo deben usar autenticación multifactor y métodos de acceso resistentes al phishing cuando estén disponibles.
- Los commits destinados a ramas protegidas deben firmarse y verificarse criptográficamente cuando la regla de firma esté activada.
- Los force-push y la eliminación de ramas protegidas deben permanecer bloqueados salvo una recuperación administrativa explícita.

## Reporte responsable

No publiques credenciales, vulnerabilidades explotables ni datos sensibles en Issues públicos.

Para un problema de seguridad, usa un canal privado del propietario del repositorio o las funciones privadas de reporte de seguridad de GitHub cuando estén habilitadas.

## Autoridad de cambios

La revisión final de código y de cambios sensibles corresponde a:

**Erick Rivaldo Flores Maza**  
GitHub: `@ErickRFM`

La presencia de este documento y de `CODEOWNERS` identifica la autoridad de revisión, pero la protección efectiva de `main`, las revisiones obligatorias y la exigencia de commits firmados deben mantenerse activadas en la configuración de reglas del repositorio.
