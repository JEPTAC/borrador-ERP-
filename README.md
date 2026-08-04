# EI ERP Nova V8 · Operación simplificada por roles

ERP de Trazabilidad logística reconstruido alrededor de una sola matriz de roles, una máquina de estados explícita y autorización definitiva en Supabase.

```text
Supabase Auth
      ↓
Bandeja mínima del rol
      ↓
Proceso autorizado y pedido asignado
      ↓
RPC transaccional + RLS por rol, ruta y usuario
      ↓
Eventos/VSM + archivos en Google Drive
```

## Cambios V8

- 13 roles exactos y 13 módulos mínimos.
- Ventas consulta únicamente sus pedidos.
- Auxiliar logístico opera únicamente alistamientos asignados.
- Auxiliar de Corte opera únicamente cortes asignados y prealistamiento controlado.
- Duvan gestiona punto, recoge y despacho local de Recepción a Cierre.
- Javier gestiona despacho nacional de Recepción a Cierre.
- Facturación deja de ser un rol genérico y pertenece al dueño de ruta.
- Gerencia, Jefe y Auditoría son perfiles de supervisión; no ejecutan operación ordinaria.
- Comentarios y novedades viven dentro del pedido.
- Solicitudes formales para cancelación, cambio de ruta, stock, flujo, reapertura, corrección, finanzas y no entrega.
- Caja valida contado/mixto antes de logística y carga factura después de Facturación solo para PVN contado/mixto.
- Cartera gestiona mora, retenciones y solicitudes de crédito.
- PVE pasa obligatoriamente por Compras.
- Cliente, modalidad de entrega y condición de pago son obligatorios.
- Sin respaldo automático a despacho nacional.
- Diagnóstico integral exclusivo para Super Admin.

## Fuentes de verdad

```text
apps/trazabilidad/config/operating-model.json   Roles y permisos
engine/shared/json/flow-contract.json           Transiciones normales
engine/shared/json/exception-contract.json      Excepciones y devoluciones
engine/shared/js/role-policy.js                  Control de interfaz
supabase/sql/05_REESTRUCTURAR_ROLES_Y_FLUJO_V8.sql  Control de servidor
```

## Activación

1. Publique el parche V8 en GitHub conservando las carpetas.
2. Si la base V7 ya está activada, ejecute únicamente `supabase/sql/05_REESTRUCTURAR_ROLES_Y_FLUJO_V8.sql`.
3. Confirme que Javier sea `despacho_nacional`, Duvan `coordinador_logistico` y Andrés Mendoza `recepcion_mercancia`.
4. Limpie datos del sitio, caché y Service Worker.
5. Ingrese como Super Admin y ejecute el diagnóstico integral.
6. Ejecute GitHub Actions en modo `smoke` y luego `exhaustive`.

## Validación

```bash
npm run qa
```

La QA estática valida 192 combinaciones iniciales, 768 variantes de ciclo de vida y 20 excepciones controladas. La certificación definitiva requiere publicar el código, ejecutar el SQL en producción y correr las pruebas E2E con las cuentas reales de cada rol.

Consulte:

- `docs/ARQUITECTURA_POR_ROLES_V8.md`
- `docs/MATRIZ_PERMISOS_V8.md`
- `docs/MATRIZ_EXCEPCIONES_V8.md`
- `docs/FLUJO_OPERATIVO_V8.html`
