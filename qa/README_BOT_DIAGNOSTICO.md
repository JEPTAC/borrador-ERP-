# Bot de diagnóstico end-to-end · EI ERP

Este bot usa Playwright y GitHub Actions para operar la aplicación como un usuario real. No requiere Node.js en el computador local.

## Qué revisa

1. Inicio de sesión de cada cuenta configurada y carga del perfil/rol.
2. Apertura de todas las transacciones publicadas en `transactions.json`.
3. Errores JavaScript, promesas rechazadas, solicitudes fallidas y HTTP 4xx/5xx.
4. Creación de pedidos PVC, PVN, PVE y PVP.
5. Combinaciones de prioridad, entrega y condición de pago.
6. Carga de archivos PNG y CSV en soportes, recepción y evidencias.
7. Exploración automática de acciones visibles hasta cierre o bloqueo.
8. Persistencia en `public.cases`, cuando se configura `SUPABASE_SERVICE_ROLE_KEY`.
9. Limpieza de registros cuyo número comienza por `QA-BOT-*`.

## Modos

- `smoke`: 8 combinaciones críticas.
- `pairwise`: conjunto mínimo que cubre todos los pares de valores entre dimensiones.
- `exhaustive`: 240 combinaciones: 4 tipos × 3 prioridades × 5 entregas × 4 pagos.

El modo `exhaustive` escribe 240 pedidos de prueba. Debe usarse con la limpieza habilitada y la `service_role` configurada.

## Configuración de GitHub

En el repositorio abra `Settings > Secrets and variables > Actions` y cree:

### `ERP_TEST_ACCOUNTS_JSON`

Pegue un JSON equivalente a `qa/accounts.example.json`, pero con las cuentas reales. No guarde contraseñas directamente en el repositorio.

### `SUPABASE_SERVICE_ROLE_KEY`

Pegue la clave Legacy `service_role`. Se usa únicamente dentro del runner privado de GitHub para validar persistencia y eliminar registros QA.

## Ejecución

1. Abra la pestaña `Actions`.
2. Seleccione `Bot diagnóstico ERP`.
3. Pulse `Run workflow`.
4. Indique la URL pública del ERP o deje el campo vacío para usar GitHub Pages.
5. Seleccione `smoke`, `pairwise` o `exhaustive`.
6. Al terminar, descargue el artefacto `diagnostico-erp-*`.

## Archivos del resultado

- `DIAGNOSTICO_ERP.md`: resumen legible para compartir.
- `DIAGNOSTICO_ERP.json`: detalles técnicos estructurados.
- `html-report/index.html`: informe visual de Playwright.
- `test-results/`: capturas, trazas y videos de fallos.
- `journal.ndjson`: secuencia completa de eventos del bot.

Comparta `DIAGNOSTICO_ERP.md`, `DIAGNOSTICO_ERP.json` y, cuando exista, la carpeta de la prueba fallida.
