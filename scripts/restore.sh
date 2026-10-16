#!/bin/sh
# Restaura una copia creada con scripts/backup.sh. Sustituye los datos actuales.
# Uso: scripts/restore.sh backups/sancho-AAAAMMDD-HHMMSS.dump
# El .env debe tener la misma SANCHO_ENCRYPTION_KEY que el servidor de origen.
set -eu
file="${1:?Indica el fichero .dump}"
[ -s "$file" ] || { echo "No existe o está vacío: $file" >&2; exit 1; }
docker compose stop api worker
docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner' < "$file"
docker compose start api worker
echo "Restaurada: $file"
