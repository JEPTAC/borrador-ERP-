# Activación y despliegue · EI ERP Nova V7

## 1. Base de datos

En Supabase > SQL Editor:

1. Ejecutar `supabase/sql/00_ACTIVAR_TODO_EI_ERP_V7.sql`.
2. Ejecutar `supabase/sql/99_VALIDAR_EI_ERP_V7.sql`.
3. Confirmar perfiles vinculados, objetos `true`, huérfanos en 0 y tiempo laboral en 31800 segundos.
4. `inventory_chipas` puede iniciar en 0, por decisión de migración.

## 2. Supabase Auth

En Authentication > URL Configuration:

- **Site URL:** URL productiva del ERP.
- **Redirect URLs:** raíz productiva, `/index.html`, y URL temporal de pruebas.

Active Google Provider únicamente si se utilizará el botón Google. Configure allí el Client ID/Secret del proveedor y registre las mismas URL de redirección.

## 3. Google Drive

En Google Cloud Console, para el OAuth Client configurado en `core/js/config.js`:

- Agregue el origen exacto del GitHub Pages o dominio productivo en **Authorized JavaScript origins**.
- Mantenga el alcance `https://www.googleapis.com/auth/drive.file`.
- No publique Client Secret de Google en GitHub.

## 4. Edge Function administrativa

Solo es necesaria para crear usuarios desde Administración:

```bash
supabase login
supabase link --project-ref hezjxcxxcjlpmyalftam
supabase functions deploy admin-create-user
```

La función usa la Secret Key del entorno de Supabase. No coloque `sb_secret_` en JavaScript.

## 5. GitHub

1. Extraiga el paquete diferencial en la raíz y acepte reemplazar.
2. Ejecute `ELIMINAR_FIREBASE_V7.ps1` en Windows o `ELIMINAR_FIREBASE_V7.sh` en Linux/macOS.
3. Suba los cambios.
4. Espere el despliegue.
5. Abra en incógnito o elimine el Service Worker anterior y haga recarga forzada.

## 6. Aceptación mínima

- Inicio/cierre de sesión y recuperación de contraseña.
- Portal y permisos por rol.
- Crear pedido PVN/PVC/PVE/PVP.
- Liberación PVE por Compras.
- Recepción, alistamiento, Corte y retorno a Alistamiento.
- Facturación bloqueada con cortes pendientes.
- Crédito: Ventas envía y Cartera decide.
- Carga y apertura de evidencia Drive.
- VSM con pedidos, eventos, procesos, responsables y calendario laboral.
- Dos usuarios editando el mismo pedido: la segunda versión obsoleta debe rechazarse.
