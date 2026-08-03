# Reemplazo total del repositorio en GitHub

EI ERP Nova V6.1 es una **base completa de repositorio**. No debe aplicarse como otro parche encima de V5.

## 1. Respaldo obligatorio

Antes de reemplazar:

1. Crear una rama o etiqueta de respaldo del repositorio actual.
2. Exportar reglas, índices y configuración de Firebase vigentes.
3. Confirmar que existe un respaldo reciente de Firestore y Storage.
4. Registrar el commit productivo actual.

Ejemplo:

```bash
git checkout -b respaldo-erp-v5
git push origin respaldo-erp-v5
git checkout main
```

## 2. Reemplazo limpio

El ZIP está preparado con los archivos del nuevo repositorio en su raíz. Deben conservarse únicamente la carpeta `.git` y, cuando aplique, secretos/configuraciones locales no versionadas.

Procedimiento recomendado:

```bash
# Desde una copia local limpia del repositorio
git checkout main
git pull

# Eliminar el contenido versionado anterior, conservando .git
git rm -r .

# Extraer aquí el contenido de EI-ERP-NOVA-V6.1-REPOSITORIO-COMPLETO.zip
git add -A
git status
```

No se debe copiar V6.1 encima de carpetas antiguas sin limpiar, porque quedarían scripts, módulos y conectores obsoletos que ya no pertenecen a la arquitectura nueva.

## 3. Instalación y validación

En la raíz:

```bash
npm install
npm run qa
```

En Functions:

```bash
cd functions
npm install
cd ..
```

La validación mínima debe terminar sin hallazgos críticos.

## 4. Configuración Firebase

Antes de desplegar:

- Verificar `core/config/firebase-config.js`.
- Confirmar proveedores de Firebase Authentication.
- Confirmar que cada usuario tenga perfil activo y rol válido en `users`.
- Revisar reglas de Firestore y Storage con Emulator Suite.
- Crear los índices necesarios.
- Revisar variables y secretos utilizados por Functions.
- No reintroducir secretos o endpoints del conector Siesa retirado.

## 5. Despliegue por etapas

Orden recomendado:

1. Proyecto Firebase de pruebas.
2. Reglas e índices.
3. Functions.
4. Hosting.
5. Prueba de aceptación por rol.
6. Ventana de despliegue productivo.

Comandos orientativos:

```bash
firebase use <proyecto-pruebas>
firebase emulators:start

firebase deploy --only firestore:rules,firestore:indexes,storage
firebase deploy --only functions
firebase deploy --only hosting
```

## 6. Aceptación funcional

Probar al menos:

- Inicio de sesión, Google y correo/contraseña.
- Usuario sin perfil bloqueado.
- Portal con aplicaciones permitidas.
- Menú y transacciones por rol.
- Crear pedidos PVC, PVN, PVE y PVP.
- Solicitud de crédito: Ventas envía y Cartera decide.
- Compras, recepción, alistamiento, corte, facturación y despacho.
- Búsqueda por pedido, cliente, OC, factura y estado.
- VSM y tiempos.
- Carga de archivos desde iPhone/iPad.
- Red intermitente y reanudación.
- Concurrencia de dos usuarios.

## 7. Puesta en producción

Después de la aceptación:

```bash
git commit -m "Reconstrucción total EI ERP Nova V6.1"
git push origin main
```

Mantener la rama V5 durante el periodo de estabilización. No eliminar respaldos hasta completar una restauración de prueba y cerrar los defectos de salida.

## 8. Inventario cíclico

La aplicación de Inventario cíclico no forma parte de este paquete porque su carpeta no fue suministrada. Debe integrarse como una aplicación separada dentro del portal después de auditar su autenticación, roles, persistencia y rutas. No debe copiarse dentro de Trazabilidad logística ni publicarse como tarjeta vacía.
