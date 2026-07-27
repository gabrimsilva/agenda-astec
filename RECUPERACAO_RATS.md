# 🚨 PLANO DE RECUPERAÇÃO DE RATs - 101 RATs Corrompidas

## ⚠️ IMPORTANTE - LEIA ANTES DE COMEÇAR

**BACKUP JÁ CRIADO:**
- ✅ `/home/super/astec_backup_before_rollback_.sql.gz` (410MB - Estado atual 24/07)

## 📋 PASSO A PASSO

### **FASE 1: Preparação (ANTES de reverter VM)**

```bash
# 1. Verificar estado atual
ssh super@10.3.1.135 "date && docker ps | grep astec"

# 2. Confirmar backup existe
ssh super@10.3.1.135 "ls -lh /home/super/astec_backup_before_rollback_.sql.gz"
```

---

### **FASE 2: Reverter VM para 23/07**

1. Acesse o hypervisor/console da VM
2. Reverta para snapshot/backup de 23/07/2026
3. Anote o horário exato do snapshot (importante!)

---

### **FASE 3: Extração dos dados (NA VM REVERTIDA)**

**Me passe o novo SSH quando a VM subir revertida!**

Vou executar:

```bash
# 1. Conectar na VM revertida
ssh super@NOVO_IP_OU_10.3.1.135

# 2. Verificar data do sistema
date
# Deve mostrar 23/07/2026

# 3. Verificar se Docker está rodando
docker ps | grep astec

# 4. Extrair APENAS tabela rats com dados
docker exec astec-db pg_dump -U astec -d astec \
  -t rats \
  --data-only \
  --column-inserts \
  --inserts \
  > /home/super/rats_recovery_23jul.sql

# 5. Verificar arquivo criado
ls -lh /home/super/rats_recovery_23jul.sql

# 6. Contar quantas RATs foram extraídas
grep -c "INSERT INTO" /home/super/rats_recovery_23jul.sql

# 7. Copiar para máquina local (Windows)
scp super@10.3.1.135:/home/super/rats_recovery_23jul.sql C:\Users\gmsilva\Desktop\
```

---

### **FASE 4: Voltar VM para estado atual**

1. Reverter VM para snapshot de 24/07 (estado atual)
2. Ou avançar o relógio do sistema
3. Verificar que voltou: `ssh super@10.3.1.135 "date"`

---

### **FASE 5: Restaurar RATs corrompidas (NA VM ATUAL)**

```bash
# 1. Enviar arquivo de volta
scp C:\Users\gmsilva\Desktop\rats_recovery_23jul.sql super@10.3.1.135:/home/super/

# 2. Criar script de merge inteligente
ssh super@10.3.1.135

# 3. Dentro da VM, criar script de merge
cat > /home/super/merge_rats.sh << 'EOF'
#!/bin/bash

# IDs das 101 RATs corrompidas (extraído da query anterior)
CORRUPTED_IDS=(
"dee131a4-1218-4eb9-9ad3-ec8833e2511c"
"c3121c1c-dadb-4c34-a70c-e031143e6a5f"
"b53ba3e5-7e41-44a1-8aa8-c07c58aa369c"
"94151504-c7e6-49b5-8038-ab4c70d4c5cc"
"6ff58778-cc65-457e-a137-8a73b7951d48"
# ... (adicionar todas as 101 IDs)
)

echo "Deletando RATs corrompidas..."
for id in "${CORRUPTED_IDS[@]}"; do
  docker exec astec-db psql -U astec -d astec -c "DELETE FROM rats WHERE id = '$id';"
done

echo "Restaurando RATs do backup..."
docker exec -i astec-db psql -U astec -d astec < /home/super/rats_recovery_23jul.sql

echo "Verificando recuperação..."
docker exec astec-db psql -U astec -d astec -c "SELECT COUNT(*) as recuperadas FROM rats WHERE form_data IS NOT NULL AND status = 'completa';"

echo "✅ Recuperação concluída!"
EOF

chmod +x /home/super/merge_rats.sh

# 4. Executar merge
/home/super/merge_rats.sh

# 5. Verificar resultado
docker exec astec-db psql -U astec -d astec -c "
SELECT 
  COUNT(*) as total_completas,
  COUNT(CASE WHEN form_data IS NULL OR form_data = '{}' THEN 1 END) as ainda_corrompidas,
  COUNT(CASE WHEN form_data IS NOT NULL AND form_data != '{}' THEN 1 END) as recuperadas
FROM rats 
WHERE status = 'completa';
"
```

---

## ⚠️ RISCOS E CONSIDERAÇÕES

### **O que pode dar errado:**

1. **Conflito de timestamps:** RATs modificadas entre 23-24/07 podem ter conflito
2. **Perda de dados 23-24/07:** Qualquer dado criado nesse período será perdido
3. **IDs duplicados:** Se alguma RAT foi criada com mesmo ID

### **Mitigação:**

- Já temos backup completo do estado atual
- Vamos fazer merge seletivo (só RATs corrompidas)
- Podemos reverter tudo se der errado

---

## 📊 VALIDAÇÃO PÓS-RECUPERAÇÃO

```bash
# 1. Verificar RATs corrompidas restantes
docker exec astec-db psql -U astec -d astec -c "
SELECT COUNT(*) 
FROM rats 
WHERE status = 'completa' 
  AND (form_data IS NULL OR form_data = '{}');
"
# Deve mostrar: 0

# 2. Verificar total de RATs completas
docker exec astec-db psql -U astec -d astec -c "
SELECT COUNT(*) 
FROM rats 
WHERE status = 'completa';
"

# 3. Verificar RATs por técnico
docker exec astec-db psql -U astec -d astec -c "
SELECT t.name, COUNT(*) as rats_completas
FROM rats r
JOIN technicians t ON r.technician_id = t.id
WHERE r.status = 'completa'
GROUP BY t.name
ORDER BY rats_completas DESC;
"
```

---

## 🎯 RESULTADO ESPERADO

- ✅ 101 RATs recuperadas com dados completos
- ✅ Zero RATs corrompidas (form_data NULL)
- ✅ Sistema funcionando normalmente
- ✅ Bug corrigido para o futuro

---

## 📞 PRÓXIMOS PASSOS

Quando subir a VM revertida:
1. **Me passe o SSH** (pode ser o mesmo IP)
2. Confirme a data: `date` deve mostrar 23/07/2026
3. Eu executo a extração
4. Você reverte VM para 24/07
5. Eu faço o merge das RATs

**ESTOU PRONTO! Me avise quando a VM estiver revertida para 23/07.**
