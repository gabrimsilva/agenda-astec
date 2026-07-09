-- Verificar registros importados de cada tabela
SELECT 'users' as tabela, COUNT(*) as total FROM users
UNION ALL
SELECT 'technicians', COUNT(*) FROM technicians
UNION ALL
SELECT 'activity_types', COUNT(*) FROM activity_types
UNION ALL
SELECT 'clients', COUNT(*) FROM clients
UNION ALL
SELECT 'activities', COUNT(*) FROM activities
UNION ALL
SELECT 'rats', COUNT(*) FROM rats
UNION ALL
SELECT 'activity_day_status', COUNT(*) FROM activity_day_status
UNION ALL
SELECT 'activity_time_records', COUNT(*) FROM activity_time_records
UNION ALL
SELECT 'reschedule_history', COUNT(*) FROM reschedule_history
UNION ALL
SELECT 'agenda_blocks', COUNT(*) FROM agenda_blocks
ORDER BY tabela;
