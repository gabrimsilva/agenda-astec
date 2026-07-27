-- Script de Restauração Inteligente de RATs v2
-- Restaura apenas RATs corrompidas com dados do backup

-- 1. Criar tabela temporária
CREATE TEMP TABLE rats_backup (LIKE rats INCLUDING ALL);

-- 2. Backup de segurança
CREATE TABLE IF NOT EXISTS rats_before_recovery_20260724 AS 
SELECT * FROM rats WHERE status = 'completa' AND (form_data IS NULL OR form_data = '{}');

SELECT 'Backup de segurança criado: ' || COUNT(*) || ' RATs corrompidas' as status
FROM rats_before_recovery_20260724;
