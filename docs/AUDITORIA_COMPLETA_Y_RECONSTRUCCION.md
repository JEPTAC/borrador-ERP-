# Auditoría integral y reconstrucción de EI ERP

## 1. Alcance

La revisión cubrió la arquitectura de EI ERP V5, navegación, autenticación, permisos, motores funcionales, rutas, carga documental, diseño adaptable, dependencias, seguridad, reglas de Firebase, trazabilidad y mantenibilidad.

La conclusión principal es que V5 podía continuar funcionando, pero no era una base sostenible para seguir acumulando cambios. La solución correcta no era agregar otra capa de navegación: era crear una plataforma empresarial nueva y aislar el motor transaccional existente hasta completar su migración por dominios.

## 2. Hallazgos cuantitativos de V5

| Indicador | Resultado auditado |
|---|---:|
| Archivos del proyecto | 186 |
| Líneas JavaScript | 26.945 |
| Tamaño del runtime principal | 1.211.054 bytes |
| Líneas del runtime principal | 20.654 |
| Funciones declaradas en el runtime | 1.311 |
| Nombres de funciones repetidos | 11 |
| Bloques `catch` vacíos | 141 |
| Estilos HTML incrustados en el runtime | 110 |
| Referencias a parches Vxx | 1.142 |
| Referencias internas a Siesa | 178 |
| Referencias externas/CDN en HTML, JS, CSS y JSON | 73 |

## 3. Fallos críticos

### 3.1 Arquitectura monolítica

La mayor parte de la operación dependía de `shared/js/runtime/app-runtime.js`. El archivo mezclaba autenticación, permisos, consultas, mutaciones, formularios, lectores PDF, inventario, corte, recepción, despachos, notificaciones, recuperación offline, renderizado y múltiples correcciones históricas.

Consecuencias:

- Una modificación local podía afectar procesos no relacionados.
- Era difícil probar una transacción de forma aislada.
- La carga inicial incluía código que el usuario nunca utilizaba.
- Los errores podían quedar ocultos por bloques `catch` vacíos.
- La navegación por módulos no equivalía a una separación real del código.

### 3.2 Navegación duplicada e inconsistente

La aplicación tenía distintos shells para:

- Módulos heredados.
- Módulos empresariales.
- Solicitudes de crédito.
- VSM.
- Móvil.

El buscador y el menú se inyectaban después de la carga, y algunas páginas no recibían todos los estilos. Esto explica el buscador blanco, el contenido desbordado y la navegación doble mostrados en las capturas.

### 3.3 No existía un portal de aplicativos

El inicio abría directamente la aplicación logística. No existía la jerarquía empresarial requerida:

1. Autenticación.
2. Portal de aplicativos.
3. Aplicativo elegido.
4. Procesos del aplicativo.
5. Transacciones autorizadas por rol.

### 3.4 Permisos inferidos y duplicados

La versión heredada contenía mecanismos que podían inferir roles a partir del correo cuando el perfil no respondía. Esto es útil como contingencia técnica, pero no es apropiado para un ERP: un usuario sin perfil válido debe quedar bloqueado, no recibir un rol supuesto.

También existían reglas repetidas entre JavaScript, módulos y Firestore, aumentando el riesgo de divergencias.

### 3.5 Rutas declaradas sin apertura determinista

El parámetro `route` no siempre se respetaba después de autenticar porque el runtime restablecía la ruta predeterminada del rol. Por eso un acceso directo podía terminar en otra pantalla.

### 3.6 Módulos empresariales genéricos mezclados con trazabilidad

Inventarios/WMS, MRP, Calidad, Mantenimiento y otros módulos se habían agregado al mismo menú aunque el objetivo actual es una plataforma con aplicativos separados. Esto aumentaba la densidad visual y podía presentar funcionalidades aún no integradas con los procesos reales.

### 3.7 Código residual de integración contable

Aunque los conectores productivos ya no estaban activos, permanecían referencias, reglas, nombres de colección, selectores y código histórico de Siesa. La nueva plataforma elimina la integración externa del catálogo, rutas, Functions, reglas y navegación.

### 3.8 Diseño responsive por acumulación

La adaptación móvil dependía de múltiples correcciones insertadas dentro del runtime. No había perfiles de entrada separados para iOS, portátil compacto o pantalla cuadrada.

### 3.9 Pruebas con cobertura estructural limitada

Las pruebas V5 comprobaban principalmente presencia de cadenas, archivos y rutas. No verificaban suficientemente:

- Jerarquía de autenticación y portal.
- Apertura determinista de transacciones.
- Separación entre Ventas y Cartera.
- Consistencia visual entre motores.
- Perfiles responsive dedicados.
- Ausencia total del conector externo.
- Referencias locales de toda la nueva arquitectura.

## 4. Reconstrucción realizada

### 4.1 Nueva arquitectura

```text
Inicio de sesión
      ↓
Portal de aplicativos
      ↓
Trazabilidad logística
      ↓
Procesos autorizados por rol
      ↓
Transacciones / bandejas / formularios
      ↓
Motor operativo y Firebase
```

### 4.2 Inicio de sesión obligatorio

El nuevo `index.html` es una pantalla de autenticación completa. Incluye:

- Logo institucional.
- Correo y contraseña.
- Acceso con Google.
- Persistencia local o por sesión.
- Estado de conexión y mensajes accesibles.
- Mostrar/ocultar contraseña.
- Sesión existente con opción de continuar o cambiar cuenta.
- Validación obligatoria del perfil y del rol en Firestore.
- Sin inferir roles por correo.
- Atajo para saltar al formulario.
- Opciones de tamaño de texto, contraste, tema y movimiento reducido.

### 4.3 Portal de aplicativos

Después de autenticarse, el usuario ve únicamente los aplicativos publicados y autorizados. La versión entregada publica solo **Trazabilidad logística**, porque es el único aplicativo cuyo código fue suministrado y auditado.

El aplicativo de Inventario cíclico no se muestra como tarjeta incompleta. La arquitectura ya permite registrarlo cuando se suministre su carpeta y se validen permisos, rutas y persistencia.

### 4.4 Centro transaccional de Trazabilidad logística

El aplicativo fue organizado en:

- Inicio.
- Ventas.
- Gestión de cartera.
- Compras.
- Recepción.
- Alistamiento y corte.
- Facturación.
- Caja y liberación.
- Entregas y despachos.
- Proyectos.
- Control operativo.
- VSM e indicadores.
- Auditoría y tiempos.
- Administración.

Cada proceso contiene acciones concretas. Ventas, por ejemplo, muestra de inmediato:

- Crear pedido.
- Crear solicitud de crédito.
- Registro de ventas.

### 4.5 Buscador único

El buscador ahora pertenece al shell principal, no a cada módulo. Busca:

- Aplicativos y procesos.
- Transacciones.
- Pedidos.
- Clientes.
- Órdenes de compra.
- Facturas.
- Estados.
- Solicitudes de crédito.

El acceso se realiza mediante el botón visible o `Ctrl + K` / `Cmd + K`.

### 4.6 Diseño unificado

Se creó un sistema de diseño central con:

- Tokens de color, espaciado, radios y sombras.
- Componentes de botones, campos, tarjetas, chips y estados.
- Navegación lateral única.
- Barra superior única.
- Centro de búsqueda único.
- Área de transacción integrada.
- Tema claro, oscuro y alto contraste.
- Indicadores de foco visibles.
- Objetivos táctiles de al menos 44 px en la interfaz nueva.

### 4.7 Perfiles responsive dedicados

Existen entradas independientes:

```text
/index.html
/ios/index.html
/compact/index.html
/square/index.html

/portal/index.html
/portal/ios/index.html
/portal/compact/index.html
/portal/square/index.html

/apps/trazabilidad/index.html
/apps/trazabilidad/ios/index.html
/apps/trazabilidad/compact/index.html
/apps/trazabilidad/square/index.html
```

Todos comparten la misma lógica, pero cargan un perfil de presentación específico. Esto evita duplicar reglas de negocio.

### 4.8 Conservación segura del motor operativo

El diseño, autenticación, portal y navegación fueron reconstruidos desde cero. El motor operativo existente se aisló en `/engine` y se abre dentro del nuevo espacio transaccional.

Esta decisión evita perder o alterar de forma simultánea:

- Colecciones Firestore existentes.
- Recepción de mercancía.
- Stickers.
- Corte y evidencias.
- Flujo de pedidos.
- PVP.
- Solicitudes de crédito.
- Facturación.
- Despachos.
- VSM.

El motor ya no controla el menú global. En modo embebido se ocultan sus shells anteriores y se aplica el tema Nova.

## 5. Alcance real de “recrear desde cero”

La plataforma y la experiencia de usuario sí fueron reconstruidas. El motor transaccional fue conservado temporalmente como capa de compatibilidad para proteger la información y los flujos ya levantados.

Reescribir simultáneamente las 20.654 líneas del motor sin pruebas operativas por área aumentaría el riesgo de pérdida de datos. La migración correcta es por transacción:

1. Portar una transacción a un servicio modular.
2. Comparar resultados con producción.
3. Ejecutar aceptación con el área responsable.
4. Activar la nueva transacción.
5. Retirar la función equivalente del motor heredado.

## 6. Riesgos todavía pendientes de validación productiva

- Inicio de sesión con usuarios reales.
- Disponibilidad de perfiles `users` para todos los colaboradores.
- Consultas e índices de Firestore bajo datos reales.
- Permisos efectivos de Storage para expedientes de crédito.
- Evidencias y carga de archivos desde iPhone/iPad.
- Transacciones offline y posterior sincronización.
- Datos reales del VSM.
- Pruebas de concurrencia entre dos usuarios sobre el mismo pedido.
- Integración del aplicativo de Inventario cíclico, cuya carpeta no fue suministrada.

## 7. Conclusión

EI ERP Nova elimina el problema de seguir acumulando menús y parches. La nueva base separa plataforma, aplicativos, procesos, transacciones y motor operativo. La navegación se vuelve predecible, por rol y orientada a tareas, mientras la lógica productiva permanece protegida durante su migración gradual.

## 8. Correcciones de seguridad posteriores a la auditoría inicial

Durante la reconstrucción también se corrigieron:

- Excepciones de privilegio asociadas a una identidad concreta en VSM.
- Asignaciones personales rígidas en despachos, reemplazadas por equipos y configuración.
- Bloques de manejo de errores que ocultaban fallos.
- Acceso directo al motor fuera del shell principal.
- Permisos de creación y decisión de crédito mezclados entre áreas.
- Consultas del shell que descargaban indiscriminadamente todos los casos para roles restringidos.

Las consultas nuevas se construyen según rol, identidad y proceso antes de presentar resultados. No obstante, la regla heredada de lectura de `cases` todavía permite lectura a usuarios activos; esta autorización debe migrarse al servidor antes de retirar definitivamente el motor de compatibilidad.

## 9. Estado real de Siesa

La integración externa fue retirada de:

- Catálogo de aplicaciones y transacciones.
- Navegación y buscador.
- Functions y endpoints.
- Colas Inbox/Outbox.
- Secretos, reglas e índices exclusivos.
- Service Worker y precargas.

Permanecen nombres históricos en campos y parsers utilizados para leer documentos o datos ya existentes. Esas referencias no abren una conexión, no llaman una API y no envían información a Siesa. Eliminarlas sin migración podría romper lectura de históricos, por lo que quedan registradas como deuda semántica controlada.

## 10. Resultado automático final

La suite `npm run qa` terminó con:

```text
0 hallazgos críticos
3 advertencias documentadas
10 controles de auditoría superados
336 referencias locales verificadas
4 pruebas unitarias aprobadas
0 pruebas fallidas
```

Las advertencias son:

1. Autorización amplia de lectura de `cases` por compatibilidad.
2. Motor monolítico pendiente de migración por transacciones.
3. Nombres históricos de campos/parsers relacionados con Siesa.

## 11. Compromiso de calidad y límite de garantía

La reconstrucción elimina fallos estructurales comprobables y crea controles automáticos para impedir que reaparezcan. Sin embargo, ningún repositorio puede declararse libre de defectos productivos sin ejecutar aceptación sobre datos reales, reglas desplegadas, dispositivos físicos, red intermitente y concurrencia.

La entrega se considera técnicamente preparada para pasar a ambiente de pruebas, no para omitir la etapa de estabilización.
