#!/bin/bash
# Script para executar no servidor 10.3.1.135
# Execute: ssh gmsilva@10.3.1.135 "bash -s" < execute_construtora_rat.sh

echo "=== CRIANDO RAT PARA CONSTRUTORA RAMALHO MOREIRA ==="
echo "Conectando ao banco de dados..."

cd /app

echo "1. Localizando atividade multidias da CONSTRUTORA RAMALHO MOREIRA..."
ACTIVITY_DATA=$(docker exec astec-db psql -U astecuser -d astecdb -t -c "
SELECT 
  id || '|' || title || '|' || client_name || '|' || technician_id || '|' || activity_type_id || '|' || scheduled_date || '|' || end_date || '|' || status || '|' || COALESCE(work_completed::text, 'null') || '|' || COALESCE(check_out_time::text, 'null')
FROM activities 
WHERE client_name ILIKE '%CONSTRUTORA RAMALHO MOREIRA%' 
  AND end_date IS NOT NULL 
  AND status = 'concluido' 
ORDER BY scheduled_date DESC 
LIMIT 1;
" | tr -d ' ')

if [ -z "$ACTIVITY_DATA" ]; then
    echo "❌ ERRO: Nenhuma atividade multidias concluída encontrada para CONSTRUTORA RAMALHO MOREIRA"
    exit 1
fi

echo "Atividade encontrada: $ACTIVITY_DATA"

# Extrair dados da atividade
IFS='|' read -r ACTIVITY_ID TITLE CLIENT_NAME TECHNICIAN_ID ACTIVITY_TYPE_ID SCHEDULED_DATE END_DATE STATUS WORK_COMPLETED CHECK_OUT_TIME <<< "$ACTIVITY_DATA"

echo "2. Verificando se RAT já existe para esta atividade..."
EXISTING_RAT=$(docker exec astec-db psql -U astecuser -d astecdb -t -c "SELECT report_number FROM rats WHERE activity_id = '$ACTIVITY_ID';" | tr -d ' ')

if [ ! -z "$EXISTING_RAT" ]; then
    echo "⚠️  RAT já existe para esta atividade: $EXISTING_RAT"
    echo "Detalhes da RAT existente:"
    docker exec astec-db psql -U astecuser -d astecdb -c "
    SELECT 
      r.report_number,
      r.status,
      r.client_name,
      r.open_date,
      r.created_at
    FROM rats r
    WHERE r.activity_id = '$ACTIVITY_ID';
    "
    exit 0
fi

echo "3. Verificando tipo de atividade..."
ACTIVITY_TYPE_INFO=$(docker exec astec-db psql -U astecuser -d astecdb -t -c "
SELECT name || '|' || COALESCE(requires_rat::text, 'null') || '|' || COALESCE(parent_id, 'null')
FROM activity_types 
WHERE id = '$ACTIVITY_TYPE_ID';
" | tr -d ' ')

IFS='|' read -r TYPE_NAME REQUIRES_RAT PARENT_ID <<< "$ACTIVITY_TYPE_INFO"
echo "Tipo de atividade: $TYPE_NAME (requires_rat: $REQUIRES_RAT)"

echo "4. Obtendo próximo número de RAT..."
NEXT_RAT_NUMBER=$(docker exec astec-db psql -U astecuser -d astecdb -t -c "
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
" | tr -d ' ')

echo "Próximo número RAT: $NEXT_RAT_NUMBER"

echo "5. Criando RAT..."
docker exec astec-db psql -U astecuser -d astecdb -c "
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
  '$NEXT_RAT_NUMBER',
  '$ACTIVITY_ID',
  '$TECHNICIAN_ID',
  'CONSTRUTORA RAMALHO MOREIRA LTDA',
  '{}',
  'pendente',
  NOW(),
  NOW(),
  NOW()
);
"

if [ $? -eq 0 ]; then
    echo "✅ RAT criada com sucesso!"
    echo "6. Verificando RAT criada..."
    docker exec astec-db psql -U astecuser -d astecdb -c "
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
    WHERE r.activity_id = '$ACTIVITY_ID';
    "
else
    echo "❌ ERRO ao criar RAT"
    exit 1
fi

echo "=== PROCESSO CONCLUÍDO ==="