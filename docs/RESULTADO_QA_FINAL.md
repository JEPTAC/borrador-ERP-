# Resultado final de QA — EI ERP Nova V6.1

**Fecha:** 3 de agosto de 2026  
**Comando principal:** `npm run qa`

## Resultado consolidado

```text
Auditoría: 0 críticos, 3 advertencias, 10 controles superados.

✓ arquitectura de tres niveles
✓ catálogo transaccional conectado
✓ PVP y crédito permanecen en el flujo
✓ flujos conectados y chequeos mínimos
✓ autenticación accesible y sin roles inferidos
✓ responsive dedicado
✓ motor embebido sin navegación duplicada
✓ diseño NOVA unificado y búsqueda por rol
✓ Siesa externo retirado
✓ seguridad y despliegue
✓ referencias locales
✓ JSON y JavaScript
QA GENERAL EI ERP NOVA V6 OK

Functions: sintaxis válida.
Pruebas unitarias: 4 aprobadas, 0 fallidas.
```

## Cobertura estructural

- 14 módulos transaccionales.
- 32 transacciones registradas.
- 336 referencias locales verificadas.
- 33 archivos HTML.
- 42 archivos JavaScript.
- Entradas dedicadas para iOS, portátil compacto y pantalla cuadrada.
- 0 bloques `catch` vacíos detectados.
- 0 módulos publicados sin ruta funcional.
- 0 rutas del conector externo Siesa publicadas.

## Pruebas unitarias de backend

1. Disponibilidad excluye cuarentena y descuenta reservas activas.
2. Necesidad neta incluye stock de seguridad y política de reposición.
3. Tiempo hábil excluye almuerzo y festivos.
4. Functions conserva las capacidades ERP sin el conector contable externo.

## Verificación HTTP local

Respondieron con estado `200`:

```text
/
/ios/
/compact/
/square/
/portal/
/portal/ios/
/portal/compact/
/portal/square/
/apps/trazabilidad/
/apps/trazabilidad/ios/
/apps/trazabilidad/compact/
/apps/trazabilidad/square/
/engine/modules/ventas/?route=create&embedded=1
/engine/modules/vsm/dashboard.html?embedded=1
```

## Advertencias abiertas

1. La regla de lectura de `cases` aún es amplia para usuarios activos por compatibilidad. La interfaz filtra y las nuevas consultas reducen exposición, pero la autorización debe migrarse completamente al servidor.
2. El motor de compatibilidad mantiene 20.352 líneas y debe dividirse transacción por transacción.
3. Persisten 76 nombres de campos o parsers históricos asociados a Siesa para lectura compatible. No existe integración externa activa.

## Límites de esta validación

No fue posible certificar desde este entorno:

- Autenticación contra el proyecto Firebase productivo.
- Disponibilidad y calidad de todos los perfiles reales.
- Reglas e índices bajo la totalidad de los datos reales.
- Carga documental desde dispositivos iOS físicos.
- Operación offline real y posterior sincronización.
- Concurrencia de usuarios sobre el mismo pedido.
- Rendimiento con el volumen productivo completo.
- Integración de Inventario cíclico, porque su carpeta no fue suministrada.

Por lo tanto, “0 críticos automatizados” no equivale a prometer ausencia absoluta de defectos en producción. La salida debe pasar por el plan de aceptación incluido en el repositorio.
