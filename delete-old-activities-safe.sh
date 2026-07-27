#!/bin/bash
# Script SEGURO para excluir atividades antigas sem RAT
# Cria backup antes de excluir

echo "================================================"
echo "EXCLUSÃO SEGURA DE ATIVIDADES ANTIGAS SEM RAT"
echo "================================================"
echo ""

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. CRIAR BACKUP
echo -e "${YELLOW}📦 Passo 1: Criando backup do banco de dados...${NC}"
BACKUP_FILE="backup_antes_delete_$(date +%Y%m%d_%H%M%S).sql"
DATABASE_URL="postgresql://astec:astec@db:5432/astec"
docker exec astec-app pg_dump "$DATABASE_URL" > ~/$BACKUP_FILE

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Backup criado com sucesso: ~/$BACKUP_FILE${NC}"
    BACKUP_SIZE=$(ls -lh ~/$BACKUP_FILE | awk '{print $5}')
    echo -e "${GREEN}   Tamanho: $BACKUP_SIZE${NC}"
else
    echo -e "${RED}❌ ERRO ao criar backup! Abortando...${NC}"
    exit 1
fi

echo ""

# 2. CONTAR ATIVIDADES QUE SERÃO EXCLUÍDAS
echo -e "${YELLOW}🔍 Passo 2: Verificando quantas atividades serão excluídas...${NC}"

COUNT_QUERY="
SELECT COUNT(*) 
FROM activities a
LEFT JOIN rats r ON r.activity_id = a.id
WHERE a.status = 'concluido'
  AND a.work_completed = true
  AND a.scheduled_date <= '2026-02-23 23:59:59'
  AND r.id IS NULL;
"

COUNT=$(docker exec -it astec-app psql "$DATABASE_URL" -t -c "$COUNT_QUERY" | tr -d ' \r\n')

echo -e "${GREEN}   Atividades encontradas: $COUNT${NC}"
echo ""

if [ "$COUNT" -eq "0" ]; then
    echo -e "${GREEN}✅ Nenhuma atividade para excluir. Script finalizado.${NC}"
    exit 0
fi

# 3. MOSTRAR DETALHES DAS ATIVIDADES
echo -e "${YELLOW}📋 Passo 3: Listando atividades que serão excluídas...${NC}"

LIST_QUERY="
SELECT 
  a.client_name,
  TO_CHAR(a.scheduled_date, 'DD/MM/YYYY') as data
FROM activities a
LEFT JOIN rats r ON r.activity_id = a.id
WHERE a.status = 'concluido'
  AND a.work_completed = true
  AND a.scheduled_date <= '2026-02-23 23:59:59'
  AND r.id IS NULL
ORDER BY a.scheduled_date DESC
LIMIT 10;
"

docker exec -it astec-app psql "$DATABASE_URL" -c "$LIST_QUERY"

if [ "$COUNT" -gt "10" ]; then
    echo -e "${YELLOW}   ... e mais $((COUNT - 10)) atividades${NC}"
fi

echo ""

# 4. CONFIRMAÇÃO
echo -e "${RED}⚠️  ATENÇÃO: Esta operação é IRREVERSÍVEL!${NC}"
echo -e "${RED}   $COUNT atividades serão EXCLUÍDAS permanentemente.${NC}"
echo -e "${GREEN}   Backup salvo em: ~/$BACKUP_FILE${NC}"
echo ""
read -p "Deseja continuar? (digite SIM em maiúsculas): " CONFIRM

if [ "$CONFIRM" != "SIM" ]; then
    echo -e "${YELLOW}❌ Operação cancelada pelo usuário.${NC}"
    exit 0
fi

echo ""

# 5. EXCLUIR
echo -e "${YELLOW}🗑️  Passo 4: Excluindo atividades...${NC}"

DELETE_QUERY="
DELETE FROM activities
WHERE id IN (
  SELECT a.id
  FROM activities a
  LEFT JOIN rats r ON r.activity_id = a.id
  WHERE a.status = 'concluido'
    AND a.work_completed = true
    AND a.scheduled_date <= '2026-02-23 23:59:59'
    AND r.id IS NULL
);
"

docker exec -it astec-app psql "$DATABASE_URL" -c "$DELETE_QUERY"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Atividades excluídas com sucesso!${NC}"
else
    echo -e "${RED}❌ ERRO ao excluir atividades!${NC}"
    echo -e "${YELLOW}   Você pode restaurar o backup com:${NC}"
    echo -e "${YELLOW}   docker exec -i astec-app psql \"$DATABASE_URL\" < ~/$BACKUP_FILE${NC}"
    exit 1
fi

echo ""
echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN}✅ OPERAÇÃO CONCLUÍDA COM SUCESSO!${NC}"
echo -e "${GREEN}================================================${NC}"
echo ""
echo -e "${GREEN}📦 Backup disponível em: ~/$BACKUP_FILE${NC}"
echo -e "${YELLOW}   Para baixar para seu computador:${NC}"
echo -e "${YELLOW}   scp super@10.3.1.135:~/$BACKUP_FILE .${NC}"
echo ""
echo -e "${YELLOW}⚠️  Para restaurar o backup (se necessário):${NC}"
echo -e "${YELLOW}   docker exec -i astec-app psql \"$DATABASE_URL\" < ~/$BACKUP_FILE${NC}"
echo ""
