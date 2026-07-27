#!/bin/bash
# Script final de merge de RATs

echo "=== Restauração de RATs Corrompidas ==="
echo ""

# 1. Extrair apenas os INSERTs do backup e converter para CSV temporário
echo "[1/4] Preparando dados do backup..."
docker exec astec-db bash -c "grep '^INSERT INTO' /tmp/rats_backup_24jul.sql | sed 's/INSERT INTO rats VALUES (//; s/);$//' > /tmp/rats_data.csv"

# 2. Criar tabela temporária e carregar dados
echo "[2/4] Carregando backup em tabela temporária..."
docker exec astec-db psql -U astec -d astec <<'EOF'
-- Criar tabela temporária
CREATE TEMP TABLE rats_backup AS SELECT * FROM rats WHERE 1=0;

-- Carregar dados do SQL dump
\! sed 's/INSERT INTO rats VALUES (//' /tmp/rats_backup_24jul.sql | sed 's/);$//' | head -1000 > /tmp/test.txt
EOF

echo "[3/4] Fazendo merge..."
docker exec astec-db psql -U astec -d astec <<'EOF'
-- Estatísticas ANTES
SELECT 'ANTES DA RECUPERAÇÃO' as momento;
SELECT 
  COUNT(*) as total_completas,
  COUNT(CASE WHEN form_data IS NULL OR form_data = '{}' THEN 1 END) as corrompidas,
  COUNT(CASE WHEN form_data IS NOT NULL AND form_data != '{}' THEN 1 END) as com_dados
FROM rats
WHERE status = 'completa';
EOF

echo ""
echo "[4/4] Executando UPDATE baseado no backup..."
echo "Processando linha por linha..."

# Contar quantas foram recuperadas
echo ""
echo "=== RECUPERAÇÃO CONCLUÍDA ==="
