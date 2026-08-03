# EI ERP Nova V6.1

Plataforma empresarial de Electroingeniería reconstruida con una jerarquía clara:

```text
Inicio de sesión obligatorio
        ↓
Portal de aplicativos
        ↓
Aplicativo autorizado
        ↓
Procesos del usuario
        ↓
Transacciones, bandejas y formularios
        ↓
Firebase y motor operativo
```

## Contenido de esta versión

- Autenticación accesible con correo/contraseña y Google.
- Perfil y rol Firestore obligatorios, sin inferencia por correo.
- Portal empresarial preparado para varios aplicativos.
- Trazabilidad logística organizada en 14 módulos y 32 transacciones.
- Menú, buscador, pendientes y KPIs visibles según rol.
- Ventas crea pedidos y solicitudes de crédito; Cartera revisa y decide.
- Pedidos PVC, PVN, PVE y PVP.
- VSM integrado dentro del entorno principal.
- Perfiles dedicados para iOS, portátil compacto y pantalla cuadrada.
- Sistema visual único para plataforma y motor embebido.
- Conector externo Siesa retirado.
- Motor operativo heredado aislado para proteger datos durante la migración.

## Estructura principal

```text
index.html                  Inicio de sesión
portal/                     Portal de aplicativos
apps/trazabilidad/          Centro transaccional por rol
core/                       Diseño, autenticación y configuración
engine/                     Motor operativo aislado
functions/                  Backend Firebase
firestore.rules             Seguridad de datos
storage.rules               Seguridad documental
docs/                       Auditoría, arquitectura y aceptación
tests/                      QA estructural y funcional
```

## Validación

```bash
npm install
npm run qa
```

Resultado de la entrega:

```text
0 hallazgos críticos automatizados
3 advertencias residuales documentadas
10 controles de auditoría superados
336 referencias locales verificadas
4 pruebas unitarias aprobadas
```

## Despliegue

Esta versión reemplaza por completo el contenido versionado anterior; no debe copiarse como parche. Consulte:

- `docs/REEMPLAZO_TOTAL_GITHUB.md`
- `docs/PLAN_PRUEBAS_ACEPTACION.md`
- `docs/RESULTADO_QA_FINAL.md`
- `docs/REGISTRO_DE_HALLAZGOS.md`

Antes de producción deben existir respaldo, prueba en Firebase de pruebas, aceptación por cada rol y validación en dispositivos reales.

## Alcance pendiente

La aplicación de Inventario cíclico no se incluyó porque su carpeta no fue suministrada. El portal queda preparado para integrarla como aplicativo independiente cuando se disponga del código.
