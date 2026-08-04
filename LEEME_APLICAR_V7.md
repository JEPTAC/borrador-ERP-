# Aplicar EI ERP Nova V7 sobre V6.2

Este paquete es diferencial. No elimina el repositorio ni vuelve a cargar los CSV.

## Orden obligatorio

1. En Supabase SQL Editor ejecute `supabase/sql/00_ACTIVAR_TODO_EI_ERP_V7.sql`.
2. Ejecute `supabase/sql/99_VALIDAR_EI_ERP_V7.sql`.
3. Extraiga el ZIP diferencial sobre la raíz del repositorio y acepte reemplazar.
4. Ejecute uno de estos archivos desde la raíz:
   - Windows: `ELIMINAR_FIREBASE_V7.ps1`
   - Linux/macOS: `ELIMINAR_FIREBASE_V7.sh`
5. Suba los cambios a GitHub.
6. Haga recarga forzada o abra en incógnito para retirar la caché V6.2.
7. Configure URL de Auth y origen OAuth Drive según `docs/ACTIVACION_Y_DESPLIEGUE_V7.md`.

La Edge Function `admin-create-user` es necesaria solo si Administración va a crear usuarios desde el ERP. Los usuarios ya migrados pueden iniciar sesión sin esa función.
