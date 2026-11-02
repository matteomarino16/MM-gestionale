#!/bin/sh
# Crea il database separato usato dai test di integrazione ed end-to-end.
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -c "CREATE DATABASE gestionale_test OWNER \"$POSTGRES_USER\";"
