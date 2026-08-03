# Plan de pruebas de aceptación

## Autenticación

- Ingreso con correo y contraseña.
- Ingreso con Google.
- Usuario sin perfil: acceso bloqueado.
- Usuario inactivo: acceso bloqueado.
- Sesión local y sesión temporal.
- Cerrar sesión desde portal y aplicativo.

## Portal

- Solo aparece Trazabilidad logística.
- El rol no puede abrir aplicativos no autorizados.
- Cambio entre diseño automático, compacto, cuadrado e iOS.

## Ventas

- Crear PVC, PVN, PVE y PVP.
- Verificar etiqueta PVP en el flujo.
- Crear solicitud de crédito.
- Guardar borrador incompleto.
- Impedir envío con menos de 15 documentos.
- Enviar expediente completo a Cartera.

## Cartera

- Visualizar solicitud enviada.
- Iniciar revisión.
- Marcar cada documento.
- Devolver con observaciones.
- Aprobar expediente válido.
- Rechazar con motivo.
- Confirmar que Cartera no crea solicitudes.

## Flujo logístico

- Compras libera PVE.
- Recepción acepta pedido.
- Recepción registra mercancía y stickers.
- Alistamiento identifica corte.
- Corte registra inicio, final y evidencia.
- Facturación recibe pedido completo/parcial.
- Despacho local y nacional cierran correctamente.

## Búsqueda

- Buscar por pedido.
- Buscar por cliente.
- Buscar por OC.
- Buscar por factura.
- Buscar por estado.
- Buscar solicitud de crédito.
- Buscar una transacción por nombre.

## Responsive

- iPhone Safari.
- iPad Safari.
- Android Chrome.
- Portátil 1366 × 768.
- Pantalla 1280 × 1024.
- Pantalla cuadrada 1024 × 1024.
- Escritorio 1920 × 1080.
- Zoom al 200 %.
- Navegación completa con teclado.

## Concurrencia y guardado

- Dos usuarios abren el mismo pedido.
- Un usuario pierde conexión durante un guardado.
- Recarga después de guardar.
- Archivo grande y archivo no permitido.
- Reintento de carga de evidencia.
- Verificación de evento, usuario y fecha después de cada transición.
