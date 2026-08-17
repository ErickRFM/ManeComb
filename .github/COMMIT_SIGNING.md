# Firma verificable de commits — ManeComb

Propietario del repositorio: **Erick Rivaldo Flores Maza** (`@ErickRFM`).

Este documento define cómo deben quedar identificados y firmados los commits realizados desde los equipos del propietario.

## Identidad Git

Configura el nombre real:

```bash
git config --global user.name "Erick Rivaldo Flores Maza"
```

Configura como `user.email` un correo que esté verificado en la cuenta de GitHub `@ErickRFM`. No se fija un correo dentro del repositorio para evitar publicar información privada o utilizar una dirección incorrecta.

## Firma SSH recomendada

Git 2.34 o posterior puede firmar commits con SSH. La llave privada debe permanecer exclusivamente en el equipo del propietario; solo la llave pública se registra en GitHub.

Después de registrar una llave pública como **Signing key** en GitHub:

```bash
git config --global gpg.format ssh
git config --global user.signingkey ~/.ssh/id_ed25519.pub
git config --global commit.gpgsign true
git config --global tag.gpgSign true
```

Ajusta la ruta de `user.signingkey` si tu llave pública tiene otro nombre.

## Verificación local

```bash
git config --global --get user.name
git config --global --get user.email
git config --global --get gpg.format
git config --global --get user.signingkey
git config --global --get commit.gpgsign
```

Un commit firmado correctamente y asociado a la llave registrada debe aparecer como **Verified** en GitHub.

## Reglas del repositorio

`main` está protegida por una ruleset activa que exige Pull Request y checks verdes, y bloquea force-push y eliminación. `CODEOWNERS` conserva la autoridad de revisión del propietario.

La exigencia de commits firmados sólo debe activarse después de configurar una llave real del propietario, validarla en GitHub y asegurar que los agentes de automatización usan un flujo compatible. Hasta entonces, un commit `unsigned` no debe presentarse como `Verified` ni bloquear artificialmente el mantenimiento legítimo.

No se debe generar, copiar, guardar ni compartir una llave privada dentro de ManeComb.
