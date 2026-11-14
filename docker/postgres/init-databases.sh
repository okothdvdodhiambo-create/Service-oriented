#!/bin/sh
set -e

psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -v ON_ERROR_STOP=1 <<'SQL'
CREATE DATABASE registry;
CREATE DATABASE verification;
SQL
