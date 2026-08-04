# Matriz de permisos — ERP Nova V8

## Regla general

Cada permiso se controla en cuatro niveles: menú, pantalla, RPC de transición y políticas RLS. Una pantalla oculta no constituye autorización. Los perfiles de supervisión pueden consultar y decidir solicitudes asignadas, pero no ejecutar la operación diaria.

## Roles operativos

| Rol exacto | Bandeja y módulos | Puede ejecutar | No puede ejecutar |
|---|---|---|---|
| `ventas` | Mi trabajo, Crear pedido, Mis ventas, Nueva solicitud de crédito, Mis solicitudes | Crear pedidos; crear solicitudes de crédito; comentar sus pedidos; reportar no entrega; solicitar corrección, cambio o cancelación | Ver ventas ajenas; operar Caja, Cartera, Compras o Logística; cancelar directamente |
| `compras` | Mi trabajo, Compras PVE, Mis solicitudes | Revisar y liberar PVE; adjuntar soportes; comentar; solicitar corrección o excepción | Operar pedidos no PVE; recepción, alistamiento, facturación o entrega |
| `caja` | Mi trabajo, Caja, Mis solicitudes | Validar pago de contado/mixto; bloquear o liberar; cargar factura PVN después de Facturación; solicitar excepción financiera | Gestionar crédito/mora como Cartera; facturar el pedido operativo; enviar un pedido de regreso a Compras en el segundo control PVN |
| `cartera` | Mi trabajo, Cartera, Solicitudes de crédito, Mis solicitudes | Gestionar mora/retenciones; aprobar, rechazar o pedir documentos de crédito; liberar al siguiente control | Operar logística, facturar o entregar |
| `recepcion_mercancia` | Mi trabajo, Recepción física, Mis solicitudes | Registrar ingreso físico, conformidad, stickers y evidencias | Recibir pedidos de ventas, alistar, cortar, facturar o despachar |
| `coordinador_logistico` | Mi trabajo, Recepción local, Facturación local, Cliente en punto, Cliente recoge, Despacho local, Mis solicitudes | Gestionar de principio a cierre las rutas locales; asignar auxiliares; facturar; entregar; comentar y solicitar excepciones | Ver u operar despacho nacional; alistar o cortar como auxiliar |
| `despacho_nacional` | Mi trabajo, Recepción nacional, Facturación nacional, Despacho nacional, Cierre nacional, Mis solicitudes | Gestionar de principio a cierre la ruta nacional; asignar auxiliares; facturar; despachar; cerrar; comentar y solicitar excepciones | Ver u operar rutas locales; alistar o cortar como auxiliar |
| `aux_logistica` | Mi trabajo, Alistamiento asignado, Mis solicitudes | Marcar líneas, evidencias y novedades de pedidos expresamente asignados; retomar después de Corte | Ver pedidos no asignados; facturar, despachar, recibir pedidos o aprobar excepciones |
| `auxiliar_corte` | Mi trabajo, Corte asignado, Mis solicitudes | Ejecutar cortes asignados; registrar medidas, tiempos y evidencias; apoyar prealistamiento controlado | Operar alistamiento completo, recepción, facturación o despacho |

## Roles de supervisión

| Rol exacto | Visibilidad | Decisiones permitidas | Restricciones |
|---|---|---|---|
| `jefe_logistica` | Todas las rutas logísticas, Alistamiento, Corte, VSM e inventario de chipas | Cancelación, cambio de ruta, excepción de stock, excepción de flujo y reapertura | No puede ejecutar recepción, checklist, corte, facturación ni entrega ordinaria |
| `gerencia` | Vista transversal de todos los procesos, reportes, VSM e inventario | Prioridad, cancelación, cambio de ruta, excepción de stock, excepción de flujo, reapertura y excepción financiera | No administra usuarios ni opera pedidos ordinarios |
| `auditoria` | Vista transversal y trazabilidad completa | Ninguna transición; solo lectura | No crea, actualiza, aprueba, elimina ni reabre |
| `super_admin` | Todo el ERP | Todas las operaciones, aprobaciones, usuarios, contraseñas, diagnóstico y reparación controlada | Las acciones excepcionales deben quedar auditadas igualmente |

## Acceso a datos

- Ventas consulta únicamente pedidos creados por su UID/correo y sus solicitudes.
- Auxiliar logístico consulta únicamente pedidos cuyo arreglo `assignedUserIds` lo incluya.
- Auxiliar de Corte consulta únicamente cortes asignados y prealistamientos autorizados.
- Duvan consulta y opera únicamente `cliente_punto`, `cliente_recoge` y `despacho_local`.
- Javier consulta y opera únicamente `despacho_nacional` y `cierre_despacho_nacional`.
- Jefe, Gerencia y Auditoría consultan transversalmente; solo Jefe/Gerencia deciden las solicitudes que correspondan.
- Los permisos de escritura se vuelven a validar en el RPC usando rol exacto, proceso actual, asignación y transición solicitada.

## Novedades y solicitudes

Una novedad normal es un comentario dentro del pedido. Solo se crea una solicitud formal cuando la novedad pretende cambiar estado, responsable, ruta, información financiera o condición terminal.

La bandeja **Solicitudes y aprobaciones** se filtra por:

1. solicitudes creadas por el usuario;
2. solicitudes asignadas a su UID;
3. solicitudes asignadas a su rol exacto;
4. lectura de supervisión cuando corresponda.

