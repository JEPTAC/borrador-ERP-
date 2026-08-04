#!/usr/bin/env sh
set -eu
rm -f core/js/firebase.js engine/shared/js/firebase-config.js firebase.json firestore.rules firestore.indexes.json storage.rules
rm -rf functions
printf '%s
' 'Firebase retirado del repositorio activo. El puente supabase-legacy-adapter.js se conserva para compatibilidad interna.'
