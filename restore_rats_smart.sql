-- Script de Restauração Inteligente de RATs
-- Restaura apenas RATs corrompidas (form_data NULL) com dados do backup

-- 1. Criar tabela temporária para backup
CREATE TEMP TABLE rats_backup (LIKE rats INCLUDING ALL);

-- 2. Carregar dados do backup
\i /home/super/rats_backup_24jul.sql

-- 3. Backup de segurança antes de fazer merge
CREATE TABLE rats_before_recovery AS SELECT * FROM rats WHERE status = 'completa' AND (form_data IS NULL OR form_data = '{}');

-- 4. Atualizar RATs corrompidas com dados do backup
-- Apenas se o backup tem dados (form_data preenchido)
UPDATE rats AS r
SET 
    form_data = rb.form_data,
    photo_sections = rb.photo_sections,
    technician_signature = rb.technician_signature,
    technician_signature_name = rb.technician_signature_name,
    application_note = rb.application_note,
    surface_maintenance_grade = rb.surface_maintenance_grade,
    updated_at = NOW()
FROM rats_backup AS rb
WHERE r.id = rb.id
  AND r.status = 'completa'
  AND (r.form_data IS NULL OR r.form_data = '{}' OR r.form_data = '')
  AND rb.form_data IS NOT NULL 
  AND rb.form_data != '{}' 
  AND rb.form_data != '';

-- 5. Mostrar estatísticas da recuperação
SELECT 
    'ANTES' as momento,
    (SELECT COUNT(*) FROM rats_before_recovery) as rats_corrompidas
UNION ALL
SELECT 
    'DEPOIS' as momento,
    (SELECT COUNT(*) FROM rats WHERE status = 'completa' AND (form_data IS NULL OR form_data = '{}')) as rats_corrompidas;

-- 6. Mostrar RATs recuperadas por técnico
SELECT 
    t.name as tecnico,
    COUNT(*) as rats_recuperadas
FROM rats r
JOIN technicians t ON r.technician_id = t.id
WHERE r.id IN (SELECT id FROM rats_before_recovery)
  AND r.form_data IS NOT NULL 
  AND r.form_data != '{}'
GROUP BY t.name
ORDER BY rats_recuperadas DESC;

-- 7. Estatísticas finais
SELECT 
  COUNT(*) as total_completas,
  COUNT(CASE WHEN form_data IS NULL OR form_data = '{}' OR form_data = '' THEN 1 END) as ainda_corrompidas,
  COUNT(CASE WHEN form_data IS NOT NULL AND form_data != '{}' THEN 1 END) as com_dados
FROM rats
WHERE status = 'completa';
