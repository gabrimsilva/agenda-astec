#!/bin/bash
# Script para extrair dados das RATs da VM de backup (24/07 00:00)
# Execute na VM de BACKUP

echo "=== Extração de RATs - Backup 24/07 00:00 ==="
echo "Data/Hora atual: $(date)"
echo ""

# 1. Fazer dump COMPLETO da tabela rats (estrutura + dados)
echo "[1/3] Extraindo tabela rats completa..."
docker exec astec-db pg_dump -U astec -d astec -t rats --column-inserts --data-only > /tmp/rats_full_backup_20260724.sql

# 2. Extrair apenas RATs que estão corrompidas na produção (status=completa)
echo "[2/3] Extraindo apenas RATs completas (que podem estar corrompidas)..."
docker exec astec-db psql -U astec -d astec -c "COPY (SELECT * FROM rats WHERE status = 'completa') TO STDOUT WITH CSV HEADER" > /tmp/rats_completas_backup.csv

# 3. Gerar estatísticas
echo "[3/3] Gerando estatísticas..."
docker exec astec-db psql -U astec -d astec << 'EOF' > /tmp/rats_stats.txt
-- Total de RATs por status
SELECT status, COUNT(*) as total
FROM rats
GROUP BY status
ORDER BY total DESC;

-- RATs completas com form_data preenchido
SELECT 
  COUNT(*) as total_completas,
  COUNT(CASE WHEN form_data IS NOT NULL AND form_data != '{}' THEN 1 END) as com_dados,
  COUNT(CASE WHEN form_data IS NULL OR form_data = '{}' THEN 1 END) as sem_dados
FROM rats
WHERE status = 'completa';

-- Top 10 RATs completas mais recentes
SELECT 
  id,
  report_number,
  client_name,
  LENGTH(form_data::text) as form_data_size,
  created_at::date,
  updated_at::date
FROM rats
WHERE status = 'completa'
ORDER BY updated_at DESC
LIMIT 10;
EOF

# 4. Compactar arquivos
echo ""
echo "Compactando arquivos..."
tar -czf /tmp/rats_recovery_20260724.tar.gz /tmp/rats_*.sql /tmp/rats_*.csv /tmp/rats_*.txt

echo ""
echo "=== Extração concluída! ==="
echo ""
echo "Arquivos gerados:"
ls -lh /tmp/rats_*
echo ""
echo "Para transferir para produção:"
echo "scp /tmp/rats_recovery_20260724.tar.gz super@10.3.1.135:/home/super/"
