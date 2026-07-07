#!/bin/bash

# Get token from regular login
echo "🔑 Obtendo token..."
LOGIN_RESP=$(curl -k -s -X POST https://localhost/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@astec.com","password":"admin123"}')

TOKEN=$(echo "$LOGIN_RESP" | grep -o '"token":"[^"]*' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "❌ Erro: Não conseguiu obter token"
  echo "Resposta: $LOGIN_RESP"
  exit 1
fi

echo "✅ Token obtido: ${TOKEN:0:20}..."

# Execute cleanup
echo "🗑️  Executando cleanup de dados desde 2026-07-01..."
RESPONSE=$(curl -k -X POST https://localhost/api/admin/cleanup-test-data \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"sinceDate":"2026-07-01"}' 2>&1)

echo "$RESPONSE"

echo ""
echo "✅ Cleanup concluído!"
