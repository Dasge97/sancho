#!/bin/sh
# Copia de seguridad de PostgreSQL en formato custom de pg_dump.
# Uso: scripts/backup.sh [carpeta]   (por defecto ./backups)
# Guarda también SANCHO_ENCRYPTION_KEY fuera de este servidor: sin ella, las credenciales cifradas de la copia no se pueden leer.
set -eu
dir="${1:-backups}"
mkdir -p "$dir"
file="$dir/sancho-$(date +%Y%m%d-%H%M%S).dump"
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$file"
if [ ! -s "$file" ]; then echo "La copia está vacía: $file" >&2; rm -f "$file"; exit 1; fi
echo "Copia creada: $file"
