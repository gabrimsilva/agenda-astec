# Log de Migrações de Dados - ASTEC

## 2026-01-14: Limpeza de Duplicatas e Reclassificação de Trajetos

### 1. Remoção de Duplicatas (Concluído ✅)
**Problema**: 18 registros duplicados em `time_entries` causados por race condition no timer simultâneo.

**Solução**:
- Criada constraint composta única: `(activity_type_id, work_date, source)`
- Removidos 18 registros duplicados (mantido o primeiro de cada grupo)
- Total removido: **27,8 horas**
- Auditoria salva em: `time_entries_removed_duplicates`

**Resultado**:
- ✅ 0 duplicatas restantes
- ✅ 2.403 registros totais (9.732,0 horas)
- ✅ Constraint composta protege contra futuras duplicatas

---

### 2. Reclassificação de Horas de Trajeto (Concluído ✅)
**Problema**: 160 entradas de IDA/VOLTA (236,9 horas) estavam classificadas incorretamente nos activities genéricos "Outros atendimentos em campo" e "Outros: Carta técnica, RAT, etc."

**Causa**: Entradas com `source=ida_travel` ou `source=volta_travel` foram associadas ao activity errado durante a importação/sincronização.

**Solução**:
- Migrados 160 registros para o activity correto: "Tempo de trajeto ao cliente: planejado, inevitável ou necessário."
- **236,9 horas** reclassificadas
- **10 técnicos** afetados
- Auditoria salva em: `time_entries_trajeto_migration`

**Script executado**: `migrar_trajetos.sql`

**Validação pós-migração**:
```sql
-- Distribuição após migração
Activity Type: "Tempo de trajeto ao cliente" = 990,9 horas (293 entries)
  - timer: 723,5h
  - ida_travel: 170,1h  
  - volta_travel: 97,3h

-- Verificação
✅ 0 entradas de trajeto restantes em activities "Outros"
```

**Resultado**:
- ✅ Todos os trajetos agora estão no activity correto
- ✅ Relatórios de "horas efetivas" vs "horas adicionais" agora refletem a realidade
- ✅ Activities "Outros" agora contêm apenas trabalho efetivo

---

### 3. Correções Técnicas Relacionadas

#### 3.1. Rate Limiter IPv6 (Commit: bf0ff2d)
**Problema**: `ValidationError` derrubava o servidor ao usar keyGenerator customizado sem helper IPv6.

**Solução**: Removido keyGenerator customizado; rate-limiter trata IPv6 nativamente.

#### 3.2. Entrypoint Docker (Commit: bcf4725)
**Problema**: `drizzle-kit push` retornava exit code 0 mesmo quando falhava em prompts interativos, fazendo o servidor subir com schema desatualizado.

**Solução**: Parse de stderr para detectar "Interactive prompts require a TTY" e abortar corretamente.

#### 3.3. SKIP_DB_PUSH (Commit: 5c02b6d)
**Problema**: drizzle-kit push entrando em crash-loop por prompts interativos (--force não resolveu).

**Solução**: Adicionada flag `SKIP_DB_PUSH=1` no docker-compose.yml para deploys onde o schema já está sincronizado manualmente.

---

## Auditoria e Rastreabilidade

Todas as operações destrutivas foram auditadas:

### Tabelas de Auditoria
```sql
-- Duplicatas removidas
SELECT * FROM time_entries_removed_duplicates;

-- Trajetos reclassificados  
SELECT * FROM time_entries_trajeto_migration;
```

### Queries de Validação
```sql
-- 1. Verificar integridade da constraint
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'time_entries'::regclass AND contype = 'u';

-- 2. Verificar ausência de duplicatas
SELECT technician_id, DATE(work_date), source, minutes, LOWER(COALESCE(notes,''))
FROM time_entries
GROUP BY 1,2,3,4,5
HAVING COUNT(*) > 1;

-- 3. Verificar trajetos reclassificados
SELECT COUNT(*) 
FROM time_entries te
JOIN activity_types at ON te.activity_type_id = at.id
WHERE LOWER(at.name) LIKE '%outros%'
  AND te.source IN ('ida_travel', 'volta_travel');
-- Resultado esperado: 0
```

---

## Impacto nos Relatórios

### Antes da Migração
- Horas de trajeto (236,9h) apareciam como "efetivo" nos activities "Outros"
- Métricas de produtividade distorcidas
- Impossível separar horas de deslocamento de horas de trabalho real

### Depois da Migração
- **990,9 horas** totais no activity "Tempo de trajeto" (categoria: adicional)
- Horas efetivas agora representam apenas trabalho real
- Relatórios de produtividade por técnico refletem a realidade
- Possível análise separada de tempo de deslocamento

---

## Commits Relacionados

| Commit | Descrição |
|--------|-----------|
| f92302a | feat: adicionar constraint composta para prevenir duplicatas |
| bf0ff2d | fix: remover keyGenerator customizado incompatível com IPv6 |
| bcf4725 | fix: detectar falha real do drizzle-kit push que retorna exit 0 |
| 00a9970 | fix: usar --force no drizzle-kit push para evitar prompts |
| 5c02b6d | fix: adicionar SKIP_DB_PUSH=1 ao docker-compose.yml |

---

## Próximos Passos Recomendados

1. ✅ Monitorar logs por 48h para garantir que não há novos issues
2. ⚠️ Considerar adicionar trigger para validar `source` vs `activity_type` na inserção
3. ⚠️ Revisar lógica de classificação automática no código para prevenir futuras reclassificações incorretas
4. ⚠️ Adicionar testes de integração para prevenir duplicatas em race conditions

---

**Executado por**: Sistema automatizado (Kiro)  
**Data**: 2026-01-14  
**Ambiente**: Produção (10.3.1.135)  
**Status**: ✅ Concluído com sucesso
