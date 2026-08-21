-- Verificar histórico de atualizações da RAT-2026-0486
SELECT id, report_number, status, created_at, updated_at, 
       LENGTH(form_data::text) as form_data_size,
       LENGTH(COALESCE(photos::text, '')) as photos_size
FROM rats 
WHERE report_number = 'RAT-2026-0486' 
   OR report_number_manual = 'RAT-2026-0486'
   OR id = '8b0f11b8-9199-45bb-b804-05f138f71fec';

-- Verificar se existe activity relacionada
SELECT a.id, a.client_name, a.status, a.created_at 
FROM activities a
WHERE a.id = '636e9e06-4b20-4a58-bd39-fbae27361184';
