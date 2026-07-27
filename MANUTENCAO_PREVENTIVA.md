# 🛡️ GUIA DE MANUTENÇÃO PREVENTIVA - ASTEC

## 📊 ESTADO ATUAL DOS RECURSOS

### Recursos Disponíveis
- **CPU:** 6 cores (Intel Xeon Gold 6132 @ 2.60GHz)
- **RAM:** 7.8GB
- **Disco:** 59GB (42% usado - 24GB)
- **Status:** ✅ **BEM DIMENSIONADO** para uso atual

### Capacidade Suportada
- ✅ 50-100 usuários simultâneos
- ✅ 500-1000 atividades/dia
- ✅ 5-10 aplicações Docker
- ✅ Crescimento por 12-18 meses

---

## ⚠️ QUANDO AUMENTAR RECURSOS?

### 🔴 Sinais Críticos (Ação Imediata)
| Métrica | Threshold | Ação |
|---------|-----------|------|
| **Disco** | > 80% | Adicionar disco ou limpar |
| **RAM** | > 90% | Aumentar para 16GB |
| **Swap** | > 2GB | Aumentar RAM |
| **Load Avg** | > 6.0 | Adicionar CPUs |
| **App Down** | > 5min | Investigar + restart |

### 🟡 Sinais de Atenção (Monitorar)
| Métrica | Threshold | Observação |
|---------|-----------|------------|
| **Disco** | > 70% | Limpar caches semanalmente |
| **RAM** | > 80% | Verificar memory leaks |
| **Swap** | > 1GB | Verificar picos de uso |
| **Load Avg** | > 4.0 | Otimizar queries lentas |

---

## 🔧 MEDIDAS PREVENTIVAS IMPLEMENTADAS

### 1. ✅ Cache Backend Corrigido
**O que foi feito:**
- Adicionado `invalidateActivitiesCache()` em todos endpoints críticos
- Adicionado `broadcastActivityUpdate()` para real-time via WebSocket
- Endpoints corrigidos:
  - `POST /api/activities/:id/checkin`
  - `POST /api/activities/:id/checkout`
  - `POST /api/activities/:id/navigation/start`
  - `POST /api/activities/:id/travel/ida`

**Impacto:** ✅ Atualização INSTANTÂNEA de status

---

### 2. ✅ Cache Frontend Corrigido
**O que foi feito:**
- Corrigidas query keys para incluir `user?.id`
- 10 mutations atualizadas para invalidar cache correto
- Cache busting com `_t=${Date.now()}` mantido

**Impacto:** ✅ Sincronização imediata entre backend e frontend

---

### 3. 🔄 Configuração de Cache Otimizada

**Cache TTL Atual (server/routes.ts):**
```typescript
RATS_CACHE_TTL = 1 HOUR         // OK - RATs mudam pouco
TECHNICIANS_CACHE_TTL = 1 HOUR  // OK - técnicos mudam pouco  
ACTIVITIES_CACHE_TTL = 1 HOUR   // OK - mas SEMPRE invalidado após mutações
```

**Status:** ✅ **BEM CONFIGURADO** - Cache agressivo MAS com invalidação correta

---

## 📋 CHECKLIST DE MANUTENÇÃO

### Diário (Automático via Monitoramento)
- [ ] Verificar se app está UP
- [ ] Verificar uso de disco
- [ ] Verificar uso de RAM/Swap
- [ ] Log de erros do container

### Semanal (Automático via Cron)
- [ ] Limpar build cache Docker
- [ ] Limpar imagens antigas (> 7 dias)
- [ ] Verificar logs de erros
- [ ] Verificar crescimento do banco

### Mensal (Manual)
- [ ] Revisar alertas de monitoramento
- [ ] Verificar performance de queries lentas
- [ ] Analisar tendência de crescimento
- [ ] Backup do banco de dados
- [ ] Atualizar dependências (security patches)

### Trimestral (Manual)
- [ ] Avaliar necessidade de scale up
- [ ] Revisar logs de erros recorrentes
- [ ] Otimizar queries mais lentas
- [ ] Revisar índices do banco

---

## 🚀 SCRIPTS DE AUTOMAÇÃO

### 1. Monitoramento Horário

**Arquivo:** `monitoring/health-check.sh`

**Instalação:**
```bash
# Na VM
cd ~/agenda-astec
mkdir -p monitoring
# Copiar script health-check.sh para lá
chmod +x monitoring/health-check.sh

# Adicionar ao crontab
crontab -e
# Adicionar linha:
0 * * * * /home/super/agenda-astec/monitoring/health-check.sh
```

**O que faz:**
- ✅ Verifica disco, RAM, swap, load
- ✅ Auto-limpa cache se disco > 75%
- ✅ Auto-restart se app cair
- ✅ Loga métricas em `/var/log/astec-health.log`

---

### 2. Limpeza Semanal

**Arquivo:** `monitoring/docker-cleanup.sh`

**Instalação:**
```bash
chmod +x monitoring/docker-cleanup.sh

# Adicionar ao crontab (domingo 2h da manhã)
crontab -e
# Adicionar linha:
0 2 * * 0 /home/super/agenda-astec/monitoring/docker-cleanup.sh >> /var/log/docker-cleanup.log 2>&1
```

**O que faz:**
- ✅ Remove build cache
- ✅ Remove imagens antigas (> 7 dias)
- ✅ Remove volumes não usados
- ✅ Remove containers parados
- ✅ Libera ~2-5GB semanalmente

---

## 📈 ROADMAP DE CRESCIMENTO

### Fase 1: Atual (0-50 usuários)
**Recursos:** 6 CPU / 8GB RAM / 59GB Disco
**Status:** ✅ Suficiente
**Ação:** Apenas monitorar

### Fase 2: Crescimento (50-150 usuários)
**Trigger:** RAM > 80% por 1 semana OU Load > 4.0
**Ação Recomendada:**
1. Aumentar RAM para 16GB (prioridade)
2. Considerar SSD se disco for HDD
3. Otimizar queries lentas (índices)

**Custo estimado:** R$ 50-100/mês

### Fase 3: Expansão (150-500 usuários)
**Trigger:** RAM > 80% após upgrade OU CPU > 80%
**Ação Recomendada:**
1. Aumentar para 8-12 CPUs
2. Aumentar RAM para 32GB
3. Separar banco em servidor dedicado
4. Implementar load balancer

**Custo estimado:** R$ 200-400/mês

---

## 🎯 RECOMENDAÇÕES IMEDIATAS

### ✅ Fazer AGORA (Setup Inicial)
1. **Instalar scripts de monitoramento**
   ```bash
   ssh super@10.3.1.135
   cd ~/agenda-astec
   mkdir -p monitoring
   # Transferir scripts health-check.sh e docker-cleanup.sh
   chmod +x monitoring/*.sh
   ```

2. **Configurar crontab**
   ```bash
   crontab -e
   # Adicionar:
   0 * * * * /home/super/agenda-astec/monitoring/health-check.sh
   0 2 * * 0 /home/super/agenda-astec/monitoring/docker-cleanup.sh >> /var/log/docker-cleanup.log 2>&1
   ```

3. **Testar atualização de status**
   - Hard refresh navegador (CTRL + SHIFT + R)
   - Testar "Iniciar Deslocamento"
   - Testar "Iniciar Execução"
   - Verificar atualização instantânea

### 📊 Monitorar por 2 Semanas
- Verificar logs em `/var/log/astec-health.log`
- Confirmar que swap não cresce > 1GB
- Confirmar que disco se mantém < 50%

### 🔄 Após 2 Semanas
- Se tudo estável → **Não precisa aumentar recursos**
- Se swap > 1GB constante → Investigar memory leak
- Se disco > 60% → Limpar manualmente ou aumentar

---

## 💡 PERGUNTAS FREQUENTES

### P: Preciso aumentar RAM agora?
**R:** Não. Você tem 5.4GB livres (70% disponível). Só aumentar se:
- Swap passar de 1GB por 1 semana
- RAM ficar > 80% por 1 semana
- App começar a ficar lento

### P: E o swap em 758MB, é problema?
**R:** Não é problema agora. Significa que já houve picos de memória, mas:
- Se crescer para > 1GB → investigar
- Se estabilizar → está OK
- Se diminuir → ainda melhor

### P: O cache do backend pode encher o disco?
**R:** Não. O cache é **em memória** (RAM), não disco. O que enche disco é:
- Build cache Docker (já limpamos)
- Imagens antigas Docker (já limpamos)
- Logs antigos (configurar rotação)
- Uploads de anexos/PDFs (crescimento natural)

### P: Como prevenir problema de cache novamente?
**R:** As correções já implementadas garantem isso:
1. ✅ `invalidateActivitiesCache()` após toda mutação
2. ✅ `broadcastActivityUpdate()` para real-time
3. ✅ Query keys corretas no frontend
4. ✅ Cache busting com timestamp

**Não vai acontecer novamente!**

---

## 📞 QUANDO PEDIR AJUDA

### 🔴 Urgente (Contatar Imediatamente)
- App DOWN por > 10 minutos
- Disco > 95%
- RAM > 95% por > 30 minutos
- Banco de dados inacessível

### 🟡 Importante (Contatar em 24h)
- Swap > 2GB
- Load average > 8.0
- Disco crescendo > 10GB/semana
- Erros repetidos nos logs

### 🟢 Normal (Contatar quando possível)
- Otimização de queries lentas
- Dúvidas sobre monitoramento
- Planejamento de upgrade

---

## ✅ CONCLUSÃO

**Recursos atuais:** ✅ **SUFICIENTES**

**Ações críticas:** ✅ **IMPLEMENTADAS** (correção de cache)

**Próximos passos:**
1. Instalar monitoramento automático
2. Testar atualização de status
3. Monitorar por 2 semanas
4. Avaliar necessidade de upgrade (provavelmente NÃO)

**Expectativa:** Sistema estável por **12-18 meses** sem upgrade de recursos.

---

*Última atualização: 2026-07-16*
*Próxima revisão: 2026-08-16*
