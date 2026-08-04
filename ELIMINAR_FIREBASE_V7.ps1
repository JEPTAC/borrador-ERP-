$ErrorActionPreference = "Stop"
$paths = @(
  "core/js/firebase.js",
  "engine/shared/js/firebase-config.js",
  "firebase.json",
  "firestore.rules",
  "firestore.indexes.json",
  "storage.rules",
  "functions"
)
foreach ($path in $paths) {
  if (Test-Path $path) { Remove-Item $path -Recurse -Force; Write-Host "Eliminado: $path" }
}
Write-Host "Firebase retirado del repositorio activo. El puente supabase-legacy-adapter.js se conserva para compatibilidad interna."
