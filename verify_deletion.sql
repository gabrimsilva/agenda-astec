-- Verificar se ainda existem atividades do Administrador nos dias 12-13/08
SELECT id, client_name, scheduled_date, end_date, status
FROM activities 
WHERE technician_id = '1b146bbb-50a4-412a-8092-7cb731cbe6dc'
  AND scheduled_date::date >= '2026-08-12' 
  AND scheduled_date::date <= '2026-08-13'
ORDER BY scheduled_date;
