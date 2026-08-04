# Matriz de excepciones y devoluciones — ERP Nova V8

La fuente estructurada es `engine/shared/json/exception-contract.json`. Esta matriz define qué ocurre ante errores, novedades o desviaciones, sin permitir cambios silenciosos del flujo.

| Situación | Dónde se detecta | Responsable inicial | Decisión / destino |
|---|---|---|---|
| Falta cliente, entrega, pago, tipo o referencia | Creación / transición | Ventas | Bloquear y corregir; no se crea ni avanza |
| Referencia duplicada | Creación / servidor | Ventas | Consultar existente o usar referencia única |
| Pedido prioritario | Creación | Gerencia / Super Admin | Aprobar y continuar todas las puertas; o devolver a Ventas |
| Cliente en mora o retenido | Creación / control financiero | Cartera | Liberar, mantener en espera, pedir soporte o devolver a Ventas |
| Contado o mixto sin pago validado | Caja inicial | Caja | Liberar, esperar pago, devolver a Ventas o solicitar excepción |
| Solicitud de crédito incompleta | Crédito | Cartera | Solicitar documentos, aprobar o rechazar |
| PVE con novedad de compra | Compras | Compras | Mantener, pedir corrección, solicitar excepción o liberar |
| PDF/soporte de venta ilegible | Recepción de pedidos | Dueño de ruta | Solicitud de corrección al vendedor propietario; vuelve a la misma ruta |
| Material faltante/no encontrado | Compras/Recepción/Alistamiento/Corte | Rol que detecta | Excepción de stock a Jefe/Gerencia/Super Admin |
| Material requiere corte | Alistamiento | Auxiliar logístico | Corte asignado; al terminar vuelve a Alistamiento |
| Corte imposible o medida incorrecta | Corte | Auxiliar de Corte | Replanificar, corregir, reponer o solicitar cancelación |
| Cambio de local a nacional o viceversa | Recepción/Facturación/No entrega | Dueño de ruta/Ventas | Jefe, Gerencia o Super Admin aprueba; reasignación atómica |
| Excepción de pago | Caja/Cartera/Facturación/No entrega | Rol financiero o dueño de ruta | Caja/Cartera/Gerencia/Super Admin decide según el caso |
| PVN contado/mixto ya facturado | Después de Facturación | Caja | Cargar factura y enviar a entrega; nunca volver a Compras/Recepción |
| No entrega | Entrega/Cierre nacional | Dueño de ruta | Reprogramar, volver a Alistamiento, Caja/Cartera, cambio de ruta, cancelar o cerrar con novedad |
| Cancelación | Cualquier proceso no terminal | Solicitante autorizado | Solo Jefe, Gerencia o Super Admin aprueba; rechazo restaura el estado previo |
| Reapertura | Pedido cerrado | Jefe/Gerencia/Super Admin | Reabrir a un proceso explícito o rechazar |
| Drive no disponible | Carga de archivos | Sistema | Conservar metadato pendiente, reintentar sin duplicar y mostrar error |
| Dos usuarios avanzan a la vez | RPC | Servidor | Aceptar la primera transición válida; rechazar la segunda y refrescar |
| Usuario inactivo/sin permiso | Inicio/ruta/RPC | Sistema | Bloquear, cerrar sesión cuando corresponda y registrar diagnóstico |

## Reglas de devolución

- **Corrección de datos:** vuelve al vendedor propietario, no a todos los vendedores.
- **Corte:** siempre vuelve a Alistamiento, nunca directamente a Facturación.
- **Caja inicial:** después de liberar continúa con la siguiente puerta pendiente: Compras si es PVE; en otro caso Recepción.
- **Caja posterior a Facturación:** solo aplica a PVN contado/mixto y continúa a la entrega configurada.
- **Cambio de ruta:** actualiza dueño, proceso, asignación y visibilidad en una sola transacción.
- **Cancelación rechazada:** conserva proceso, estado, asignación y evidencias anteriores.
- **No entrega:** no borra el intento anterior; agrega comentario, evidencia y número de intento.

## Controles contra pedidos colgados

Cada pedido abierto debe cumplir simultáneamente:

1. proceso y estado válidos;
2. responsable compatible con la ruta;
3. asignación individual cuando esté en Alistamiento o Corte;
4. evento para cada transición;
5. siguiente acción posible o solicitud pendiente identificable;
6. archivos con estado `sincronizado`, `pendiente` o `error`, nunca sin estado;
7. fecha de última actividad y motivo cuando permanece en espera.

El diagnóstico de Super Admin debe marcar como crítico cualquier pedido que incumpla uno de estos controles.

