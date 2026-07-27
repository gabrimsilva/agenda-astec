#!/bin/bash
# Script para restaurar RATs na PRODUÇÃO a partir do backup
# Execute na VM de PRODUÇÃO (10.3.1.135)

echo "=== Restauração de RATs - Produção ==="
echo "Data/Hora atual: $(date)"
echo ""

# Verificar se arquivo de recovery existe
if [ ! -f "/home/super/rats_recovery_20260724.tar.gz" ]; then
    echo "❌ ERRO: Arquivo rats_recovery_20260724.tar.gz não encontrado!"
    echo "Execute primeiro o script de extração na VM de backup."
    exit 1
fi

# 1. Extrair arquivos
echo "[1/5] Extraindo arquivos de backup..."
cd /home/super
tar -xzf rats_recovery_20260724.tar.gz

# 2. Backup de segurança da produção atual
echo "[2/5] Fazendo backup de segurança da produção atual..."
docker exec astec-db pg_dump -U astec -d astec -t rats > /home/super/rats_prod_before_restore_$(date +%Y%m%d_%H%M%S).sql

# 3. Criar tabela temporária com dados do backup
echo "[3/5] Criando tabela temporária com dados do backup..."
docker exec -i astec-db psql -U astec -d astec << 'EOF'
-- Criar tabela temporária
CREATE TEMP TABLE rats_backup AS SELECT * FROM rats WHERE 1=0;

-- Carregar dados do backup
\i /tmp/rats_full_backup_20260724.sql

-- Verificar quantas RATs foram carregadas
SELECT COUNT(*) as total_backup FROM rats_backup;
EOF

# 4. Restaurar apenas RATs corrompidas (form_data NULL na produção, mas com dados no backup)
echo "[4/5] Restaurando RATs corrompidas..."
docker exec -i astec-db psql -U astec -d astec << 'EOF'
-- Atualizar RATs corrompidas com dados do backup
UPDATE rats AS r
SET 
    form_data = rb.form_data,
    photo_sections = rb.photo_sections,
    technician_signature = rb.technician_signature,
    application_note = rb.application_note,
    updated_at = NOW()
FROM rats_backup AS rb
WHERE r.id = rb.id
  AND r.status = 'completa'
  AND (r.form_data IS NULL OR r.form_data = '{}')
  AND (rb.form_data IS NOT NULL AND rb.form_data != '{}');

-- Mostrar quantas foram restauradas
SELECT 
    COUNT(*) as rats_restauradas
FROM rats r
JOIN rats_backup rb ON r.id = rb.id
WHERE r.status = 'completa'
  AND (rb.form_data IS NOT NULL AND rb.form_data != '{}');
EOF

# 5. Verificar resultado
echo "[5/5] Verificando restauração..."
docker exec -i astec-db psql -U astec -d astec << 'EOF'
SELECT 
  status,
  COUNT(*) as total,
  COUNT(CASE WHEN form_data IS NULL OR form_data = '{}' THEN 1 END) as sem_dados,
  COUNT(CASE WHEN form_data IS NOT NULL AND form_data != '{}' THEN 1 END) as com_dados
FROM rats
GROUP BY status
ORDER BY status;
EOF

echo ""
echo "=== Restauração concluída! ==="
echo ""
echo "⚠️  IMPORTANTE: Verifique os dados no sistema antes de confirmar sucesso."
echo "Se algo der errado, restaure o backup em:"
echo "  /home/super/rats_prod_before_restore_*.sql"
