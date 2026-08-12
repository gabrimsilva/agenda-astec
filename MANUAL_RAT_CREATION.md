# Manual para Criar RAT da CONSTRUTORA RAMALHO MOREIRA

## Execute estes comandos no servidor 10.3.1.135

### 1. Conectar ao servidor
```bash
ssh gmsilva@10.3.1.135
cd /app
```

### 2. Localizar a atividade multidias
```bash
docker exec astec-db psql -U astecuser -d astecdb -c "
SELECT 
  id, 
  title, 
  client_name,
  technician_id,
  activity_type_id,
  scheduled_date,
  end_date,
  status,
  work_completed
FROM activities 
WHERE client_name ILIKE '%CONSTRUTORA RAMALHO MOREIRA%' 
  AND end_date IS NOT NULL 
  AND status = 'concluido' 
ORDER BY scheduled_date DESC 
LIMIT 3;
"
```

### 3. Verificar se RAT já existe (substitua ACTIVITY_ID pelo ID encontrado)
```bash
docker exec astec-db psql -U astecuser -d astecdb -c "
SELECT report_number, status, client_name, open_date 
FROM rats 
WHERE activity_id = 'ACTIVITY_ID_AQUI';
"
```

### 4. Se não existir RAT, obter próximo número
```bash
docker exec astec-db psql -U astecuser -d astecdb -c "
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
"
```

### 5. Criar a RAT (substitua os valores pelos encontrados nas consultas anteriores)
```bash
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
  'RAT-2026-XXXX',  -- usar número da consulta 4
  'ACTIVITY_ID_AQUI',  -- ID da atividade da consulta 2
  'TECHNICIAN_ID_AQUI',  -- ID do técnico da consulta 2
  'CONSTRUTORA RAMALHO MOREIRA LTDA',
  '{}',
  'pendente',
  NOW(),
  NOW(),
  NOW()
);
"
```

### 6. Verificar se foi criada corretamente
```bash
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
WHERE r.activity_id = 'ACTIVITY_ID_AQUI';
"
```

## Exemplo Prático

Se a consulta 2 retornar:
- ACTIVITY_ID: `abc-123-def`
- TECHNICIAN_ID: `tech-456-ghi`

E a consulta 4 retornar:
- NEXT_RAT_NUMBER: `RAT-2026-0432`

Então o comando 5 ficaria:
```bash
docker exec astec-db psql -U astecuser -d astecdb -c "
INSERT INTO rats (
  id, report_number, activity_id, technician_id, client_name, 
  form_data, status, open_date, created_at, updated_at
) VALUES (
  gen_random_uuid(),
  'RAT-2026-0432',
  'abc-123-def',
  'tech-456-ghi',
  'CONSTRUTORA RAMALHO MOREIRA LTDA',
  '{}', 'pendente', NOW(), NOW(), NOW()
);
"
```

## Troubleshooting

- Se retornar "RAT já existe", não precisa criar novamente
- Se não encontrar atividade, verifique se o nome está correto
- Se der erro de permissão, confirme que está no diretório `/app`