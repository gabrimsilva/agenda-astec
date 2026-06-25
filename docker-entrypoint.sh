#!/bin/sh
set -e

echo "==> [ASTEC] Sincronizando schema do banco (drizzle-kit push)..."
# Em banco vazio, cria todas as tabelas. Em banco existente, apenas sincroniza
# (a _migration_log e ignorada via tablesFilter no drizzle.config.ts).
npx drizzle-kit push || echo "==> [ASTEC] Aviso: drizzle-kit push retornou erro (pode ja estar sincronizado). Continuando..."

echo "==> [ASTEC] Iniciando servidor..."
exec node dist/index.js
