#!/bin/sh
set -e

echo "==> [ASTEC] Sincronizando schema do banco (drizzle-kit push)..."
# stdin vindo de /dev/null: se por algum motivo o push pedir confirmação, ele recebe EOF
# e aborta em vez de travar o container (deploy nunca fica pendurado num prompt).
# Com o schema declarado por completo, o push é puramente aditivo (não remove nada).
npx drizzle-kit push < /dev/null || echo "==> [ASTEC] Aviso: drizzle-kit push retornou erro/sem confirmacao. Continuando..."

echo "==> [ASTEC] Iniciando servidor..."
exec node dist/index.js
