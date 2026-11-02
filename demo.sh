#!/usr/bin/env bash
# Levanta la demo en http://localhost:8000 con un tope de memoria:
# si el backend se pasa, el sistema lo mata a él y no se cuelga la computadora.
# d1 llega a ~4,7 GB de RAM mientras carga (después queda en la GPU).
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -d frontend/dist ]; then
  (cd frontend && npm run build)
fi

cd backend
exec systemd-run --user --scope -q -p MemoryMax=7G -p MemorySwapMax=0 \
  .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
