# EI ERP — Migración total Firebase → Supabase

Este paquete migra de forma idempotente:

- Todas las colecciones y subcolecciones de Firestore.
- Firebase Authentication: correos, teléfonos, estado, proveedores, claims, metadata y UID de origen.
- Firebase Storage: archivos, rutas, MIME, metadata y hash SHA-256.
- Perfiles y roles.
- Tablas JSONB de respaldo sin pérdida.
- Vistas SQL para VSM.

## Seguridad obligatoria

Las credenciales administrativas no deben guardarse en GitHub ni en archivos públicos. Use `.env` local o GitHub Actions Secrets. Después de una migración, rote la cuenta de servicio Firebase y todas las claves administrativas de Supabase que se hayan expuesto.

## Ejecución local en Windows

1. Instale Node.js 22 LTS.
2. Copie `.env.example` como `.env` y complételo.
3. Coloque la cuenta de servicio en `secrets/firebase-service-account.json`.
4. Si no dispone de `SUPABASE_DB_URL`, ejecute una vez `sql/000_EJECUTAR_EN_SUPABASE.sql` desde Supabase SQL Editor.
5. Ejecute `EJECUTAR_MIGRACION.ps1`.

## Ejecución segura por GitHub Actions

Configure estos secretos del repositorio:

- `FIREBASE_SERVICE_ACCOUNT_B64`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_URL`

Ejecute primero con `dry_run=true`, revise el reporte y luego repita con `dry_run=false`.

## Usuarios

Los usuarios se crean en Supabase Auth y el UID de Firebase se conserva en `user_metadata.firebase_uid` y `profiles.firebase_uid`.

Las contraseñas Firebase SCRYPT no pueden importarse mediante la Admin API de Supabase. Para usuarios de correo/contraseña se marca `must_reset_password=true`; deben restablecerla. Para evitar interrupción durante el cambio, puede habilitar temporalmente Firebase como Third-party Auth en Supabase.

## Validación

`npm run validate` compara cantidades de documentos y archivos entre el manifiesto Firebase y Supabase. El total de usuarios se revisa adicionalmente por `profiles.firebase_uid`, porque el destino puede tener usuarios preexistentes.
