-- Consultar RAT-2026-0458 completa
SELECT 
    id,
    report_number,
    report_number_manual,
    client_name,
    client_name_editable,
    status,
    is_simplified,
    open_date,
    opening_date,
    close_date,
    closing_date,
    created_at,
    updated_at,
    project_type,
    surface_maintenance_grade,
    application_note,
    technician_signature_name,
    LENGTH(form_data::text) as form_data_size,
    LENGTH(COALESCE(photos::text, '')) as photos_size,
    LENGTH(COALESCE(photo_sections::text, '')) as photo_sections_size,
    form_data::text as form_data_content,
    photo_sections::text as photo_sections_content
FROM rats 
WHERE report_number = 'RAT-2026-0458' 
   OR report_number_manual LIKE '%0458%'
   OR report_number_manual LIKE '%0034-26%';
