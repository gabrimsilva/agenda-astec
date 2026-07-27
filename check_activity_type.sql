-- Buscar a atividade e seu tipo
SELECT 
  a.id,
  a.title,
  a.client_name,
  a.activity_type_id,
  at.name as type_name,
  at.category,
  at.requires_travel
FROM activities a
LEFT JOIN activity_types at ON a.activity_type_id = at.id
WHERE a.id = '29cfa228-1182-4d7c-9b40-f92b01295067';
