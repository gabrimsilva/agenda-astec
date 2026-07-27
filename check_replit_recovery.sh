#!/bin/bash
# Script para verificar quantas RATs podem ser recuperadas do Replit

echo "=== Verificando RATs recuperáveis do Replit ==="
echo ""

# Copiar IDs para dentro do container
docker cp /tmp/prod_empty_ids.txt astec-db:/tmp/

# Verificar quantas dessas RATs têm dados no Replit
echo "[1/2] Consultando Replit..."
docker exec astec-db bash -c "
  # Converter IDs para formato SQL
  IDS=\$(cat /tmp/prod_empty_ids.txt | grep -v '^$' | sed \"s/^/'/\" | sed \"s/$/'/\" | paste -sd ',' -)
  
  # Consultar Replit
  psql 'postgresql://neondb_owner:npg_TEmNFius6W0n@ep-dark-credit-ae6dljaq.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require' -c \"
    SELECT 
      COUNT(*) as recuperaveis,
      MIN(updated_at)::date as primeira,
      MAX(updated_at)::date as ultima
    FROM rats 
    WHERE id IN (\$IDS)
      AND form_data IS NOT NULL 
      AND form_data != '{}'
  \"
"

echo ""
echo "[2/2] Listando RATs recuperáveis..."
docker exec astec-db bash -c "
  IDS=\$(cat /tmp/prod_empty_ids.txt | grep -v '^$' | sed \"s/^/'/\" | sed \"s/$/'/\" | paste -sd ',' -)
  
  psql 'postgresql://neondb_owner:npg_TEmNFius6W0n@ep-dark-credit-ae6dljaq.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require' -c \"
    SELECT 
      report_number,
      client_name,
      LENGTH(form_data::text) as tamanho_dados,
      created_at::date,
      updated_at::date
    FROM rats 
    WHERE id IN (\$IDS)
      AND form_data IS NOT NULL 
      AND form_data != '{}'
    ORDER BY updated_at DESC
    LIMIT 20
  \"
"

echo ""
echo "=== Verificação concluída ==="
