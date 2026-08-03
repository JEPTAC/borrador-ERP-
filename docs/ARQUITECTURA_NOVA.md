# Arquitectura EI ERP Nova V6

## Capas

### 1. Identidad

- `index.html`
- `core/js/firebase.js`
- `core/js/auth-page.js`
- Perfil obligatorio en `users`.
- Persistencia seleccionable.
- Autorización por rol, no por dirección de correo inferida.

### 2. Portal empresarial

- `portal/`
- `core/config/applications.json`
- Publica únicamente aplicativos activos.
- El usuario no ve carpetas, rutas técnicas ni módulos incompletos.

### 3. Aplicativo

- `apps/trazabilidad/`
- Catálogo transaccional en `config/transactions.json`.
- Menú por procesos y permisos.
- Buscador de funciones y registros.
- Perfiles responsive separados.

### 4. Motor operativo

- `engine/`
- Conserva la lógica transaccional verificada de V5.
- Funciona como capa de compatibilidad.
- Se ejecuta en modo embebido, sin navegación duplicada.
- No publica el módulo de integración externa.

### 5. Backend

- `functions/`
- `firestore.rules`
- `firestore.indexes.json`
- `storage.rules`
- Firebase Hosting, Auth, Firestore, Storage y Functions.

## Catálogo de aplicaciones

El archivo `core/config/applications.json` es la única fuente de verdad del portal. Para publicar un aplicativo se requiere:

- Carpeta funcional.
- Ruta inicial.
- Roles permitidos.
- Descripción.
- Pruebas.
- Reglas de seguridad.
- Persistencia validada.

No deben publicarse tarjetas “próximamente” dentro del entorno productivo.

## Catálogo de transacciones

Cada acción declara:

- Proceso.
- Nombre legible.
- Descripción.
- Motor.
- Módulo.
- Ruta.
- Roles autorizados.
- Requisitos mínimos.
- Condición de acceso directo.

Esto reemplaza el modelo de mostrar decenas de botones sin jerarquía.

## Estrategia de migración del motor

El motor monolítico debe dividirse progresivamente en dominios:

```text
auth/
orders/
credit/
purchases/
receiving/
picking/
cutting/
billing/
finance/
dispatch/
projects/
exceptions/
analytics/
```

Cada dominio debe separar:

- Interfaz.
- Casos de uso.
- Repositorio Firebase.
- Validadores.
- Auditoría.
- Pruebas.

## Reglas de diseño

- Una acción principal por pantalla.
- Acciones secundarias agrupadas.
- Formularios divididos por intención, no por estructura de base de datos.
- Campos obligatorios visibles antes de enviar.
- Guardado de borrador cuando el proceso lo permita.
- Estados escritos en lenguaje del usuario.
- Buscador persistente.
- Menú global estable.
- Navegación mediante teclado.
- Foco visible.
- Sin módulos desconectados.
