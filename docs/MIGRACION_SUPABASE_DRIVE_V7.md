# Arquitectura EI ERP Nova V7

## Fuente de verdad

- **Supabase Auth:** identidad, sesión y recuperación de contraseña.
- **PostgreSQL:** perfiles, roles, pedidos, eventos, listas de chequeo, cortes, novedades, crédito, auditoría y VSM.
- **Supabase Realtime:** actualización de pedidos, eventos, solicitudes y alertas.
- **Google Drive:** PDF, imágenes, evidencias y documentos físicos.

La tabla `evidences` y los expedientes de crédito conservan `fileId`, URL, nombre, tipo, tamaño, carpeta y usuario; el binario permanece en Drive.

## Compatibilidad del motor

El motor operativo heredado sigue utilizando una API con forma similar a su interfaz anterior, pero esa API es atendida por `supabase-compat.js` y RPC PostgreSQL. No se carga el SDK de Firebase ni se envían solicitudes a Firebase.

## Seguridad

La clave publicable está en el navegador y trabaja con la sesión del usuario y RLS. Las claves `sb_secret_` o `service_role` solo pertenecen a Edge Functions o procesos administrativos. La aplicación no contiene credenciales administrativas de Supabase ni secretos de Google.

## Flujo documental Drive

1. El usuario autoriza Google Drive con `drive.file`.
2. El ERP crea o reutiliza la carpeta empresarial y la carpeta del expediente.
3. El archivo se carga directamente a Drive.
4. PostgreSQL guarda el identificador y metadatos.
5. Las operaciones posteriores consultan el registro y abren el recurso de Drive.
