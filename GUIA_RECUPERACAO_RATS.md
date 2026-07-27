# 🔧 Guia de Recuperação de RATs - Backup 24/07 00:00

## 📋 Pré-requisitos
- ✅ VM de backup (24/07 00:00) funcionando
- ✅ Acesso SSH às duas VMs (backup e produção)
- ✅ Arquivos: `extract_rats_from_backup.sh` e `restore_rats_to_production.sh`

---

## 🎯 PASSO 1: Extrair dados da VM de backup

### 1.1. Subir a VM de backup (você já está fazendo)
```bash
# Anotar o IP da VM de backup quando subir
# Exemplo: 10.3.1.136 (diferente da produção 10.3.1.135)
```

### 1.2. Copiar script de extração para a VM de backup
```powershell
scp extract_rats_from_backup.sh super@<IP_BACKUP>:/home/super/
```

### 1.3. Conectar na VM de backup e executar extração
```bash
ssh super@<IP_BACKUP>
cd /home/super
chmod +x extract_rats_from_backup.sh
./extract_rats_from_backup.sh
```

### 1.4. Verificar arquivos gerados
```bash
ls -lh /tmp/rats_recovery_20260724.tar.gz
# Deve mostrar um arquivo .tar.gz com alguns MB
```

---

## 🚀 PASSO 2: Transferir para produção

### 2.1. Da VM de backup, enviar para produção
```bash
# Execute na VM de BACKUP
scp /tmp/rats_recovery_20260724.tar.gz super@10.3.1.135:/home/super/
```

**OU** se preferir, baixar para Windows e depois subir:
```powershell
# No Windows
scp super@<IP_BACKUP>:/tmp/rats_recovery_20260724.tar.gz C:\Users\gmsilva\Desktop\
scp C:\Users\gmsilva\Desktop\rats_recovery_20260724.tar.gz super@10.3.1.135:/home/super/
```

---

## 🔄 PASSO 3: Restaurar na produção

### 3.1. Copiar script de restauração para produção
```powershell
scp restore_rats_to_production.sh super@10.3.1.135:/home/super/
```

### 3.2. Conectar na produção e executar restauração
```bash
ssh super@10.3.1.135
cd /home/super
chmod +x restore_rats_to_production.sh
./restore_rats_to_production.sh
```

### 3.3. Aguardar conclusão
O script vai:
- ✅ Fazer backup de segurança da produção atual
- ✅ Carregar dados do backup em tabela temporária
- ✅ Restaurar apenas RATs corrompidas (form_data NULL)
- ✅ Preservar RATs que já têm dados

---

## ✅ PASSO 4: Verificar resultado

### 4.1. Verificar no banco
```bash
ssh super@10.3.1.135
docker exec -i astec-db psql -U astec -d astec << 'EOF'
SELECT 
  COUNT(*) as total_completas,
  COUNT(CASE WHEN form_data IS NULL OR form_data = '{}' THEN 1 END) as ainda_sem_dados,
  COUNT(CASE WHEN form_data IS NOT NULL AND form_data != '{}' THEN 1 END) as recuperadas
FROM rats
WHERE status = 'completa';
EOF
```

**Resultado esperado:**
- `ainda_sem_dados` deve ser **0** (ou muito próximo)
- `recuperadas` deve ser **~101 ou mais**

### 4.2. Testar no sistema
1. Abrir sistema em http://10.3.1.135
2. Ir em RATs
3. Abrir uma RAT que estava em branco
4. Verificar se dados aparecem

---

## 🆘 ROLLBACK (se algo der errado)

Se a restauração falhar ou corromper mais dados:

```bash
ssh super@10.3.1.135

# Encontrar o backup que foi feito
ls -lh /home/super/rats_prod_before_restore_*.sql

# Restaurar backup
docker exec -i astec-db psql -U astec -d astec << 'EOF'
-- Deletar todos os dados atuais
TRUNCATE TABLE rats CASCADE;

-- Restaurar backup
\i /home/super/rats_prod_before_restore_XXXXXX.sql
EOF

# Depois restaurar o backup completo que fizemos hoje
gunzip < /home/super/astec_backup_before_rollback_.sql.gz | docker exec -i astec-db psql -U astec -d astec
```

---

## 📊 Estatísticas esperadas

**ANTES da restauração:**
- RATs completas: ~200-300
- Com dados: ~100-200
- **SEM dados (corrompidas): 101** ❌

**DEPOIS da restauração:**
- RATs completas: ~200-300
- **Com dados: ~200-300** ✅
- SEM dados: 0-5 (apenas as muito antigas sem backup)

---

## ⚠️ IMPORTANTE

1. **NÃO desligue a VM de backup** até confirmar sucesso
2. **Teste bem** antes de confirmar
3. Se tudo der certo, pode desligar VM de backup
4. **Configure backup automático** depois (script fornecido)

---

## 📞 Suporte

Se tiver dúvidas durante o processo:
1. **NÃO continue** se algo der errado
2. Tire print do erro
3. Verifique logs: `docker logs astec-app`
4. Mantenha VM de backup ligada
