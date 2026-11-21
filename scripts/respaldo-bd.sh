#!/bin/sh
# Respaldo de PostgreSQL en formato custom (comprimido, restaurable con pg_restore).
# Uso: sh scripts/respaldo-bd.sh [base_de_datos]   (por defecto POSTGRES_DB del contenedor)
# Guarda en ./backups/<base>_<fecha>.dump (carpeta ignorada por git). Las credenciales nunca
# salen del contenedor: pg_dump corre dentro de él con su propio usuario.
set -e
cd "$(dirname "$0")/.."
CONTENEDOR="${PG_CONTAINER:-pos_restaurante_pg}"
BASE="${1:-$(docker exec "$CONTENEDOR" sh -c 'echo "$POSTGRES_DB"')}"
FECHA=$(date +%Y%m%d_%H%M%S)
mkdir -p backups
ARCHIVO="backups/${BASE}_${FECHA}.dump"
MSYS_NO_PATHCONV=1 docker exec "$CONTENEDOR" sh -c "pg_dump -U \"\$POSTGRES_USER\" -d \"$BASE\" -Fc" > "$ARCHIVO"
if [ ! -s "$ARCHIVO" ]; then
  echo "❌ El respaldo quedó vacío: $ARCHIVO"
  exit 1
fi
echo "✅ Respaldo generado: $ARCHIVO ($(wc -c < "$ARCHIVO") bytes)"
echo "   Verifica que se puede restaurar con: sh scripts/verificar-restauracion.sh $ARCHIVO $BASE"
