#!/bin/sh
set -e

# Escape hatch consciente: use apenas se precisar subir com urgencia sabendo
# que o schema pode estar desatualizado (ex: rollback emergencial).
#   docker compose run -e SKIP_DB_PUSH=1 app
if [ "$SKIP_DB_PUSH" = "1" ]; then
  echo "==> [ASTEC] ATENCAO: SKIP_DB_PUSH=1 — sincronizacao de schema IGNORADA por escolha explicita."
  echo "==> [ASTEC] O servidor pode falhar se o codigo esperar colunas que nao existem."
else
  echo "==> [ASTEC] Sincronizando schema do banco (drizzle-kit push)..."
  # stdin vindo de /dev/null: se o push pedir confirmacao interativa, ele recebe EOF
  # e aborta em vez de travar o container num prompt.
  if ! npx drizzle-kit push < /dev/null; then
    echo ""
    echo "############################################################"
    echo "  [ASTEC] DEPLOY ABORTADO: falha ao sincronizar o schema."
    echo "############################################################"
    echo ""
    echo "  O servidor NAO foi iniciado de proposito. Subir com o schema"
    echo "  fora de sincronia faz o codigo gravar/ler colunas inexistentes,"
    echo "  quebrando em producao de forma silenciosa."
    echo ""
    echo "  Causa mais comum: o push detectou uma operacao destrutiva"
    echo "  (tabela no banco que nao existe no schema) e pediu confirmacao"
    echo "  interativa, que nao existe dentro do container."
    echo ""
    echo "  Como investigar:"
    echo "    1. Rode o push manualmente para ver o que ele quer fazer:"
    echo "       docker compose exec app npx drizzle-kit push"
    echo "    2. Se houver tabela sobrando no banco, faca dump e remova,"
    echo "       ou declare-a em shared/schema.ts."
    echo "    3. Se precisar subir mesmo assim, use SKIP_DB_PUSH=1"
    echo "       ciente do risco."
    echo ""
    exit 1
  fi
  echo "==> [ASTEC] Schema sincronizado com sucesso."
fi

echo "==> [ASTEC] Iniciando servidor..."
exec node dist/index.js
