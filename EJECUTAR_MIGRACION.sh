#!/usr/bin/env bash
set -euo pipefail
[[ -f .env ]] || { cp .env.example .env; echo 'Complete .env y vuelva a ejecutar.'; exit 1; }
[[ -f secrets/firebase-service-account.json ]] || { echo 'Falta secrets/firebase-service-account.json'; exit 1; }
npm install
npm run migrate
