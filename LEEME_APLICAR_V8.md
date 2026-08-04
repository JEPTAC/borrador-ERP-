# Aplicar EI ERP Nova V8

## GitHub

Suba el contenido del parche conservando exactamente las carpetas. No suba contraseñas, `service_role` ni archivos privados de cuentas.

## Supabase

Si ya ejecutó la migración V7 y el parche V7.1, ejecute únicamente:

```text
supabase/sql/05_REESTRUCTURAR_ROLES_Y_FLUJO_V8.sql
```

El SQL migra los roles principales, crea comentarios/solicitudes, endurece RLS y aplica la máquina de estados V8.

## Después de publicar

1. Elimine los datos del sitio y el Service Worker anterior.
2. Inicie sesión como `j.perez@ei.com.co`.
3. Abra Administración → Diagnóstico integral.
4. Ejecute diagnóstico y reparación controlada.
5. Pruebe primero un pedido local a crédito y uno nacional a crédito.
6. Ejecute el bot `smoke`; después ejecute `exhaustive` con limpieza habilitada.

## Validación esperada

- 13 roles exactos.
- 13 módulos mínimos.
- 192 combinaciones iniciales.
- 768 variantes de ciclo de vida.
- 20 excepciones controladas.
- 0 errores críticos en QA estática.

La QA local no reemplaza la prueba contra Supabase y Drive productivos.
