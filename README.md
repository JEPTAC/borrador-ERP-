# EI ERP Nova V7 · Supabase + Google Drive

Plataforma empresarial de Electroingeniería con autenticación obligatoria, portal de aplicativos y un centro transaccional de Trazabilidad logística organizado por rol.

```text
Inicio de sesión Supabase Auth
        ↓
Portal empresarial de aplicativos
        ↓
Trazabilidad logística
        ↓
Procesos y transacciones autorizadas
        ↓
PostgreSQL + RLS + Realtime
        ↓
Documentos físicos en Google Drive
```

## Cambios de esta versión

- Firebase deja de ser backend activo del ERP.
- Inicio de sesión, recuperación de contraseña y sesiones mediante Supabase Auth.
- Pedidos, eventos, checklist, cortes, novedades, perfiles, roles y VSM sobre PostgreSQL.
- Autorización de lectura y escritura mediante Row Level Security y funciones transaccionales.
- Control optimista con `flowRevision` para impedir sobrescrituras concurrentes.
- Validación servidora de transiciones para evitar pedidos sin proceso o con pasos omitidos.
- Supabase Realtime para refrescar pedidos, eventos, crédito y VSM.
- Evidencias y documentos continúan físicamente en Google Drive; Supabase conserva sus metadatos e identificadores.
- Solicitudes de crédito separadas: Ventas crea y envía; Cartera revisa, devuelve, aprueba o rechaza.
- PVP reconocido como tipo de pedido en el mismo flujo operativo.
- Corte disponible en escritorio, iOS, portátil compacto y pantalla cuadrada.
- VSM autónomo con calendario laboral, movimientos, responsables, alertas y exportación CSV.
- Integración activa con Siesa eliminada.

## Estructura activa

```text
index.html                         Acceso obligatorio
portal/                            Portal de aplicativos
apps/trazabilidad/                 Centro transaccional por rol
core/js/supabase.js                Cliente Auth/Postgres/Realtime
engine/shared/js/drive-client.js   Documentos Google Drive
engine/shared/js/supabase-*.js     Puente de compatibilidad del motor legado
engine/modules/vsm/                VSM completo
supabase/sql/                      Activación, seguridad y validación
supabase/functions/                Operaciones administrativas servidoras
tests/                             Auditoría y QA
```

## Activación

1. Ejecutar `supabase/sql/00_ACTIVAR_TODO_EI_ERP_V7.sql` en el SQL Editor.
2. Ejecutar `supabase/sql/99_VALIDAR_EI_ERP_V7.sql`.
3. Configurar las URL de redirección de Supabase Auth.
4. Configurar el origen web autorizado del OAuth de Google Drive.
5. Desplegar `supabase/functions/admin-create-user` si Administración creará usuarios desde el ERP.
6. Publicar los archivos diferenciales en GitHub y ejecutar el script de eliminación de Firebase.
7. Hacer recarga forzada y retirar el Service Worker anterior.

Consulte `docs/ACTIVACION_Y_DESPLIEGUE_V7.md` y `docs/MIGRACION_SUPABASE_DRIVE_V7.md`.

## Validación local

```bash
npm run qa
```

La validación local comprueba estructura, sintaxis, rutas, ausencia de secretos, catálogo transaccional, VSM, SQL y eliminación del SDK de Firebase. La aceptación definitiva debe ejecutarse contra el proyecto Supabase productivo y Google Drive con usuarios reales.
