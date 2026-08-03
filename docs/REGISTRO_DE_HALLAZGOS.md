# Registro de hallazgos — EI ERP Nova V6.1

**Fecha de corte:** 3 de agosto de 2026  
**Alcance:** repositorio, navegación, interfaz, autenticación, autorización, flujos, persistencia, Firebase, carga documental, VSM, responsive y mantenibilidad.

## Convenciones

- **Crítico:** puede comprometer información, permisos o continuidad del proceso.
- **Alto:** produce errores operativos frecuentes o impide utilizar un módulo.
- **Medio:** dificulta la operación o aumenta significativamente el riesgo de regresión.
- **Bajo:** deuda técnica o mejora de mantenibilidad sin impacto operativo inmediato.
- **Corregido:** el control se encuentra implementado y cubierto por QA automatizado.
- **Controlado:** el riesgo permanece, pero está aislado y documentado.
- **Pendiente externo:** no puede cerrarse sin datos, código o pruebas productivas adicionales.

## Hallazgos

| ID | Severidad | Hallazgo | Riesgo observado | Tratamiento en V6.1 | Estado |
|---|---|---|---|---|---|
| H-01 | Alto | Navegación global duplicada entre módulos, VSM, crédito y páginas heredadas. | Menús diferentes, pérdida de contexto y módulos aparentemente desconectados. | Se creó un único shell transaccional y el motor se abre embebido, sin su navegación anterior. | Corregido |
| H-02 | Alto | Buscador inyectado sin estilos completos. | Contenido blanco, desbordado y controles ilegibles como los mostrados en las capturas. | El buscador pertenece ahora al shell, usa un modal accesible, navegación con teclado y fuente única de rutas. | Corregido |
| H-03 | Alto | La aplicación abría directamente logística y no existía portal empresarial. | Imposibilidad de incorporar otros aplicativos sin saturar el menú. | Se implementó la jerarquía Inicio de sesión → Portal de aplicativos → Aplicativo → Procesos → Transacciones. | Corregido |
| H-04 | Crítico | Roles inferidos o replicados en diferentes capas. | Posible acceso incorrecto cuando el perfil no existe o no responde. | El perfil y el rol en Firestore son obligatorios; una identidad sin perfil válido queda bloqueada. | Corregido |
| H-05 | Alto | Direcciones de correo y nombres concretos participaban en excepciones de privilegio o asignación. | Permisos dependientes de una persona y difícil administración de reemplazos. | Se eliminaron exclusiones por identidad y asignaciones personales; se usan roles, equipos y configuración. | Corregido |
| H-06 | Alto | Accesos directos no siempre abrían la transacción indicada. | El usuario podía terminar en la página predeterminada de su rol. | El catálogo transmite módulo y ruta deterministas al motor; la transacción activa queda resaltada. | Corregido |
| H-07 | Alto | Solicitudes de crédito difíciles de localizar y separación insuficiente entre Ventas y Cartera. | Ventas no encontraba la función y otros roles podían participar indebidamente. | Ventas crea, completa y envía; Cartera recibe, revisa y decide; Auditoría/Gerencia consultan. | Corregido |
| H-08 | Medio | VSM funcionaba como tablero aislado. | Pérdida de sesión visual, navegación paralela y percepción de módulo desconectado. | VSM está registrado como transacción y se abre dentro del shell de mismo origen. | Corregido |
| H-09 | Alto | Procesos sin lista mínima de validación. | Casos podían avanzar con información incompleta o criterios no visibles. | Todos los procesos visibles tienen chequeos mínimos. Caja y Cartera recibieron listas específicas. | Corregido |
| H-10 | Medio | Corte de cable no declaraba una transición genérica. | Un validador superficial podía reportarlo como flujo huérfano. | Se documentó y validó como subflujo que retorna mediante su cierre específico, no mediante `next`. | Controlado |
| H-11 | Alto | Adaptación responsive por acumulación de parches. | Formularios y navegación inconsistentes en iOS, portátiles pequeños y pantallas cuadradas. | Se crearon entradas dedicadas para login, portal y aplicativo en perfiles iOS, compacto y cuadrado, con lógica compartida. | Corregido |
| H-12 | Medio | Exceso de acciones simultáneas y filtros complejos. | Mayor curva de aprendizaje y errores de selección. | Una acción principal por pantalla, acciones secundarias agrupadas, filtros limpiables y búsqueda global por datos. | Corregido |
| H-13 | Crítico | Bloques `catch` vacíos ocultaban fallos. | Guardados o consultas podían fallar sin evidencia útil. | Se eliminaron 109 bloques vacíos reales y se centralizó el registro de errores. | Corregido |
| H-14 | Alto | Integración externa Siesa residual en catálogo, Functions y navegación. | Código sin uso, superficie de ataque y confusión funcional. | Se retiraron módulo, rutas, webhook, colas, secretos, índices y navegación de integración externa. | Corregido |
| H-15 | Bajo | Persisten 76 nombres históricos relacionados con Siesa en campos o parsers. | Deuda semántica y dificultad de mantenimiento. | Se conservan únicamente para leer datos/documentos históricos; no existe API, webhook ni cola activa. | Controlado |
| H-16 | Alto | El runtime operativo contiene más de 20.000 líneas. | Alto acoplamiento y riesgo de regresión al modificar procesos. | Se aisló como motor de compatibilidad y se definió migración transacción por transacción. | Controlado |
| H-17 | Alto | Lectura de `cases` permitida a todo usuario activo por compatibilidad. | La interfaz oculta datos por rol, pero la regla de servidor aún es más amplia de lo deseable. | Las consultas nuevas reducen descarga y filtran por rol; falta migrar autorización completa a colecciones/consultas de servidor. | Advertencia abierta |
| H-18 | Medio | La app de Inventario cíclico no está presente en el material recibido. | No es posible integrarla ni probar su persistencia sin inventar una tarjeta vacía. | El portal admite nuevas apps, pero no publica Inventario cíclico hasta recibir su carpeta. | Pendiente externo |
| H-19 | Medio | Dependencia heredada de Firebase Compat. | Mayor tamaño y menor modularidad que la API moderna. | Se conserva temporalmente para evitar regresiones; la migración modular queda programada por dominio. | Controlado |
| H-20 | Alto | No existía un criterio único para publicar módulos. | Funciones incompletas podían aparecer como disponibles. | Solo se publican aplicativos, módulos y transacciones con ruta, permisos, motor, requisitos y pruebas. | Corregido |

## Riesgos residuales prioritarios

### R-01. Autorización de casos en servidor

La deuda más importante es la lectura amplia de `cases`. La interfaz V6.1 ya consulta y presenta información según rol, pero una autorización robusta debe aplicarse también en Firestore. El cierre requiere separar o denormalizar campos de visibilidad, migrar los registros existentes y probar todos los roles con el Emulator Suite antes de endurecer la regla.

### R-02. Migración del motor monolítico

El motor heredado se mantiene para proteger procesos y datos. No debe seguir recibiendo funcionalidades nuevas salvo correcciones críticas. Cada transacción nueva debe construirse en un dominio independiente y retirar su equivalente heredado después de aceptación operativa.

### R-03. Pruebas productivas

Las pruebas automatizadas verifican arquitectura, referencias, permisos declarados, sintaxis y algoritmos puros. No sustituyen pruebas con usuarios, Firebase real, dispositivos físicos, cargas de archivos, red intermitente ni concurrencia.

## Criterio de cierre de la reconstrucción

La reconstrucción base puede considerarse aceptada cuando se completen:

1. Prueba de autenticación y perfiles con todos los roles reales.
2. Recorrido completo de al menos un pedido PVC, PVN, PVE y PVP.
3. Solicitud de crédito enviada por Ventas y decidida por Cartera.
4. Recepción, corte, alistamiento, facturación y despacho con evidencias.
5. Validación VSM con fechas reales.
6. Prueba en iPhone/iPad, portátil compacto y monitor cuadrado.
7. Prueba de dos usuarios actuando sobre el mismo pedido.
8. Respaldo y restauración comprobados antes del despliegue definitivo.
