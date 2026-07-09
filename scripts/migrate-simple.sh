#!/bin/bash

# Script simples para migrar dados do Replit para o banco local
# Exporta o dump do Replit e importa no banco local

echo "🚀 Iniciando migração de dados..."

REPLIT_DB="postgresql://neondb_owner:npg_TEmNFius6W0n@ep-dark-credit-ae6dljaq.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require"
LOCAL_DB="$DATABASE_URL"

# Se DATABASE_URL não estiver definido, usar default
if [ -z "$LOCAL_DB" ]; then
  LOCAL_DB="postgresql://postgres:postgres@localhost:5432/astec"
fi

# Arquivo temporário para o dump
DUMP_FILE="/tmp/replit_dump.sql"

echo "📥 Exportando dados do Replit..."
pg_dump "$REPLIT_DB" --no-owner --schema=public > "$DUMP_FILE" 2>&1

if [ $? -ne 0 ]; then
  echo "❌ Erro ao exportar do Replit"
  exit 1
fi

echo "✅ Dump exportado com sucesso"
echo "📊 Tamanho do dump: $(du -h $DUMP_FILE | cut -f1)"

# Criar script para importar apenas dados novos
echo "⚙️ Processando dump para evitar duplicatas..."

# Apenas importar dados das tabelas principais
cat "$DUMP_FILE" | grep -E "^COPY (users|technicians|activity_types|clients|activities|rats|activity_day_status|activity_time_records|reschedule_history|agenda_blocks)" > /tmp/replit_data.sql

echo "📤 Importando dados no banco local..."
psql "$LOCAL_DB" -f /tmp/replit_data.sql 2>&1 | head -50

echo "✅ Migração concluída!"
echo "📁 Arquivos temporários criados: $DUMP_FILE /tmp/replit_data.sql"
