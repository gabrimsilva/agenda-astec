-- Mudar status da RAT-2026-0486 para rascunho
UPDATE rats 
SET status = 'rascunho',
    updated_at = NOW()
WHERE report_number = 'RAT-2026-0486';

-- Verificar a mudança
SELECT id, report_number, client_name, status, updated_at 
FROM rats 
WHERE report_number = 'RAT-2026-0486';
