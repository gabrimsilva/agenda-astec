SELECT id, report_number, report_number_manual, client_name, status, 
       created_at::date as created_date, open_date::date 
FROM rats 
WHERE EXTRACT(YEAR FROM created_at) = 2025 
   OR EXTRACT(YEAR FROM open_date) = 2025 
ORDER BY created_at DESC;
