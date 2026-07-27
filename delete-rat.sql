-- Verificar a RAT antes de excluir
SELECT id, report_number, client_name, status, created_at::date, open_date::date 
FROM rats 
WHERE id = 'c1bfe0d5-025f-43d4-a1c1-07177eab9486';

-- Excluir a RAT
DELETE FROM rats WHERE id = 'c1bfe0d5-025f-43d4-a1c1-07177eab9486';

-- Confirmar exclusão
SELECT COUNT(*) as rats_restantes_2025 
FROM rats 
WHERE EXTRACT(YEAR FROM created_at) = 2025 OR EXTRACT(YEAR FROM open_date) = 2025;
