-- Script para criar RAT manualmente para multidias CONSTRUTORA RAMALHO MOREIRA
-- Baseado no código em server/routes.ts linha ~5300 (checkout handler)

-- 1. Primeiro, localizar a atividade multidias da CONSTRUTORA RAMALHO MOREIRA
SELECT 
  id, 
  title, 
  client_name,
  technician_id,
  activity_type_id,
  scheduled_date,
  end_date,
  status,
  multiday_series_id,
  work_completed,
  check_out_time
FROM activities 
WHERE client_name ILIKE '%CONSTRUTORA RAMALHO MOREIRA%' 
  AND end_date IS NOT NULL  -- multidias tem end_date
  AND status = 'concluido'  -- já foi finalizada
ORDER BY scheduled_date DESC;

-- 2. Verificar se já existe RAT para esta atividade
-- (substitua ACTIVITY_ID pelo id encontrado na consulta acima)
/*
SELECT * FROM rats WHERE activity_id = 'ACTIVITY_ID_AQUI';
*/

-- 3. Verificar o tipo de atividade e se requer RAT
-- (substitua ACTIVITY_TYPE_ID pelo encontrado na consulta acima)
/*
SELECT id, name, requires_rat, parent_id 
FROM activity_types 
WHERE id = 'ACTIVITY_TYPE_ID_AQUI';
*/

-- 4. Obter próximo número de RAT disponível
SELECT 
  'RAT-' || EXTRACT(YEAR FROM CURRENT_DATE) || '-' ||
  LPAD((
    COALESCE(
      (SELECT MAX(CAST(SUBSTRING(report_number FROM 'RAT-[0-9]{4}-([0-9]+)') AS INTEGER))
       FROM rats 
       WHERE report_number LIKE 'RAT-' || EXTRACT(YEAR FROM CURRENT_DATE) || '-%'),
      0
    ) + 1
  )::text, 4, '0') AS next_rat_number;

-- 5. Script para criar a RAT (substitua os valores pelos encontrados nas consultas acima)
/*
INSERT INTO rats (
  id,
  report_number,
  activity_id,
  technician_id,
  client_name,
  form_data,
  status,
  open_date,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  'RAT-2026-XXXX',  -- usar o número obtido na consulta 4
  'ACTIVITY_ID_AQUI',  -- ID da atividade encontrada
  'TECHNICIAN_ID_AQUI',  -- ID do técnico da atividade
  'CONSTRUTORA RAMALHO MOREIRA LTDA',  -- nome do cliente
  '{}',  -- JSON vazio para começar
  'pendente',  -- status inicial
  NOW(),  -- data de abertura = agora
  NOW(),  -- created_at
  NOW()   -- updated_at
);
*/

-- 6. Verificar se a RAT foi criada corretamente
/*
SELECT 
  r.report_number,
  r.status,
  r.client_name,
  r.open_date,
  a.title as activity_title,
  t.name as technician_name
FROM rats r
JOIN activities a ON r.activity_id = a.id
JOIN technicians t ON r.technician_id = t.id
WHERE r.activity_id = 'ACTIVITY_ID_AQUI';
*/