#!/bin/sh
# Verifica que un respaldo REALMENTE se puede restaurar (un respaldo sin probar no es un respaldo).
# Uso: sh scripts/verificar-restauracion.sh backups/<archivo>.dump [base_origen]
#
# 1. Restaura el .dump en una base temporal aislada (nunca toca la base origen).
# 2. Compara el número de filas de cada tabla contra la base origen (si se indica).
# 3. Comprueba migraciones aplicadas y que los triggers de auditoría inmutable existan.
# 4. Elimina la base temporal.
set -e
cd "$(dirname "$0")/.."
ARCHIVO="$1"
ORIGEN="$2"
CONTENEDOR="${PG_CONTAINER:-pos_restaurante_pg}"
TEMPORAL="restore_check_$(date +%s)"

if [ -z "$ARCHIVO" ] || [ ! -s "$ARCHIVO" ]; then
  echo "Uso: sh scripts/verificar-restauracion.sh backups/<archivo>.dump [base_origen]"
  exit 1
fi

psql_en() {
  MSYS_NO_PATHCONV=1 docker exec -i "$CONTENEDOR" sh -c "psql -v ON_ERROR_STOP=1 -U \"\$POSTGRES_USER\" -d \"$1\" -Atq"
}

limpiar() {
  MSYS_NO_PATHCONV=1 docker exec "$CONTENEDOR" sh -c "dropdb -U \"\$POSTGRES_USER\" --if-exists $TEMPORAL" || true
}
trap limpiar EXIT

echo "→ Restaurando $ARCHIVO en la base temporal $TEMPORAL ..."
MSYS_NO_PATHCONV=1 docker exec "$CONTENEDOR" sh -c "createdb -U \"\$POSTGRES_USER\" $TEMPORAL"
MSYS_NO_PATHCONV=1 docker exec -i "$CONTENEDOR" sh -c "pg_restore -U \"\$POSTGRES_USER\" -d $TEMPORAL --no-owner --exit-on-error" < "$ARCHIVO"

CONTEO_SQL="SELECT string_agg(t || '=' || n, ' ' ORDER BY t) FROM (
  SELECT table_name AS t,
         (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I', table_name), false, true, '')))[1]::text AS n
  FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
) x;"

RESTAURADO=$(echo "$CONTEO_SQL" | psql_en "$TEMPORAL")
MIGRACIONES=$(echo "SELECT count(*) FROM schema_migrations;" | psql_en "$TEMPORAL")
TRIGGERS=$(echo "SELECT count(*) FROM pg_trigger WHERE tgname IN ('trg_auditoria_logs_inmutable','trg_auditoria_logs_no_truncate');" | psql_en "$TEMPORAL")

echo "→ Migraciones registradas en el respaldo: $MIGRACIONES"
echo "→ Triggers de auditoría inmutable: $TRIGGERS de 2"
[ "$TRIGGERS" -ge 1 ] || { echo "❌ Falta el trigger de auditoría inmutable"; exit 1; }

if [ -n "$ORIGEN" ]; then
  ACTUAL=$(echo "$CONTEO_SQL" | psql_en "$ORIGEN")
  if [ "$ACTUAL" != "$RESTAURADO" ]; then
    echo "⚠️  Los conteos difieren de la base $ORIGEN (normal si hubo actividad después del respaldo):"
    echo "   respaldo: $RESTAURADO"
    echo "   origen  : $ACTUAL"
    exit 2
  fi
  echo "→ Filas por tabla idénticas a la base $ORIGEN"
fi
echo "✅ Restauración verificada: $(echo "$RESTAURADO" | wc -w) tablas restauradas correctamente."
