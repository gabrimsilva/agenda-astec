# Script PowerShell para criar RAT da CONSTRUTORA RAMALHO MOREIRA
# Execute este arquivo no PowerShell

Write-Host "=== CRIANDO RAT PARA CONSTRUTORA RAMALHO MOREIRA ===" -ForegroundColor Green
Write-Host "Este script irá se conectar ao servidor e executar a criação da RAT..." -ForegroundColor Yellow

# Copiar o script bash para o servidor e executá-lo
$bashScript = @"
#!/bin/bash
echo "=== CRIANDO RAT PARA CONSTRUTORA RAMALHO MOREIRA ==="
cd /app

echo "1. Localizando atividade multidias..."
ACTIVITY_DATA=`$(docker exec astec-db psql -U astecuser -d astecdb -t -c "SELECT id || '|' || title || '|' || client_name || '|' || technician_id || '|' || activity_type_id FROM activities WHERE client_name ILIKE '%CONSTRUTORA RAMALHO MOREIRA%' AND end_date IS NOT NULL AND status = 'concluido' ORDER BY scheduled_date DESC LIMIT 1;" | tr -d ' ')

if [ -z "`$ACTIVITY_DATA" ]; then
    echo "❌ Nenhuma atividade encontrada"
    exit 1
fi

IFS='|' read -r ACTIVITY_ID TITLE CLIENT_NAME TECHNICIAN_ID ACTIVITY_TYPE_ID <<< "`$ACTIVITY_DATA"
echo "Atividade: `$TITLE (ID: `$ACTIVITY_ID)"

echo "2. Verificando se RAT já existe..."
EXISTING_RAT=`$(docker exec astec-db psql -U astecuser -d astecdb -t -c "SELECT report_number FROM rats WHERE activity_id = '`$ACTIVITY_ID';" | tr -d ' ')

if [ ! -z "`$EXISTING_RAT" ]; then
    echo "⚠️ RAT já existe: `$EXISTING_RAT"
    exit 0
fi

echo "3. Obtendo próximo número de RAT..."
NEXT_RAT_NUMBER=`$(docker exec astec-db psql -U astecuser -d astecdb -t -c "SELECT 'RAT-' || EXTRACT(YEAR FROM CURRENT_DATE) || '-' || LPAD((COALESCE((SELECT MAX(CAST(SUBSTRING(report_number FROM 'RAT-[0-9]{4}-([0-9]+)') AS INTEGER)) FROM rats WHERE report_number LIKE 'RAT-' || EXTRACT(YEAR FROM CURRENT_DATE) || '-%'), 0) + 1)::text, 4, '0');" | tr -d ' ')

echo "Criando RAT: `$NEXT_RAT_NUMBER"

echo "4. Inserindo RAT no banco..."
docker exec astec-db psql -U astecuser -d astecdb -c "INSERT INTO rats (id, report_number, activity_id, technician_id, client_name, form_data, status, open_date, created_at, updated_at) VALUES (gen_random_uuid(), '`$NEXT_RAT_NUMBER', '`$ACTIVITY_ID', '`$TECHNICIAN_ID', 'CONSTRUTORA RAMALHO MOREIRA LTDA', '{}', 'pendente', NOW(), NOW(), NOW());"

if [ `$? -eq 0 ]; then
    echo "✅ RAT `$NEXT_RAT_NUMBER criada com sucesso!"
    docker exec astec-db psql -U astecuser -d astecdb -c "SELECT r.report_number, r.status, r.client_name, a.title FROM rats r JOIN activities a ON r.activity_id = a.id WHERE r.activity_id = '`$ACTIVITY_ID';"
else
    echo "❌ Erro ao criar RAT"
    exit 1
fi
"@

# Salvar o script temporariamente e executar via SSH
$bashScript | ssh gmsilva@10.3.1.135 "bash -s"

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ RAT criada com sucesso!" -ForegroundColor Green
} else {
    Write-Host "❌ Erro durante a execução" -ForegroundColor Red
}