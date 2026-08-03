# Plan de corte sin pérdida

1. Ejecutar migración inicial con el ERP aún conectado a Firebase.
2. Validar conteos, muestras, usuarios, archivos y VSM.
3. Congelar escrituras durante una ventana corta.
4. Ejecutar nuevamente la migración; es idempotente y actualiza documentos por ruta.
5. Validar el delta final.
6. Cambiar el ERP a Supabase.
7. Mantener Firebase en solo lectura durante el periodo de reversión.
8. Desactivar Firebase únicamente después de la aceptación operativa.
