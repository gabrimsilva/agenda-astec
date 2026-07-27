-- Restaurar RATs que foram deletadas mas não estavam no backup
-- (RATs criadas entre 00:00 24/07 e agora)
INSERT INTO rats
SELECT * FROM rats_before_recovery_20260724 rb
WHERE NOT EXISTS (
  SELECT 1 FROM rats r WHERE r.id = rb.id
);

-- Mostrar quantas foram restauradas
SELECT 'RATs restauradas: ' || COUNT(*) as info
FROM rats_before_recovery_20260724 rb
WHERE NOT EXISTS (
  SELECT 1 FROM rats r WHERE r.id = rb.id
);

-- Estatísticas finais
SELECT 
  'Total completas' as metrica,
  COUNT(*) as valor
FROM rats WHERE status = 'completa'
UNION ALL
SELECT 
  'Com dados',
  COUNT(*)
FROM rats WHERE status = 'completa' AND form_data IS NOT NULL AND form_data != '{}'
UNION ALL
SELECT 
  'Sem dados',
  COUNT(*)
FROM rats WHERE status = 'completa' AND (form_data IS NULL OR form_data = '{}');
