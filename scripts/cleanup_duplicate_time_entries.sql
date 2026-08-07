-- ============================================================================
-- Remocao de time_entries duplicados
-- ============================================================================
-- CONTEXTO
--   Ate a correcao do indice unico composto, o endpoint de conclusao de dia
--   podia ser chamado repetidas vezes e recriava os lancamentos do mesmo dia,
--   inflando as horas nos relatorios.
--
-- CRITERIO DE DUPLICATA (conservador, para nao remover horas legitimas)
--   Mesmo tecnico + mesmo dia + mesma etapa (source) + mesmos minutos
--   + MESMA NOTA (comparada sem diferenciar maiusculas).
--
--   A nota inclui o nome do cliente e, em multi-dia, o dia especifico. Sem
--   ela, dois lancamentos legitimos de atividades diferentes que coincidissem
--   em duracao seriam removidos por engano (verificado: 62 registros nessa
--   situacao, que este script PRESERVA).
--
-- RETENCAO
--   Mantem o registro MAIS ANTIGO de cada grupo (created_at, desempate por id)
--   e remove apenas as copias posteriores.
--
-- SEGURANCA
--   - Roda em transacao unica
--   - Copia os registros removidos para time_entries_removed_duplicates
--     (auditoria e rollback)
--   - Nao altera nenhum registro mantido
-- ============================================================================

BEGIN;

-- 1) Tabela de auditoria dos removidos
CREATE TABLE IF NOT EXISTS time_entries_removed_duplicates (
  LIKE time_entries INCLUDING DEFAULTS
);
ALTER TABLE time_entries_removed_duplicates
  ADD COLUMN IF NOT EXISTS removed_at timestamp DEFAULT now();
ALTER TABLE time_entries_removed_duplicates
  ADD COLUMN IF NOT EXISTS kept_entry_id varchar;

-- 2) Identifica duplicatas: rn = 1 é o mantido, rn > 1 são removidos
CREATE TEMP TABLE dups_to_remove AS
WITH ranked AS (
  SELECT
    id,
    FIRST_VALUE(id) OVER (
      PARTITION BY technician_id, DATE(work_date), source, minutes,
                   LOWER(COALESCE(notes,''))
      ORDER BY created_at ASC, id ASC
    ) AS keep_id,
    ROW_NUMBER() OVER (
      PARTITION BY technician_id, DATE(work_date), source, minutes,
                   LOWER(COALESCE(notes,''))
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM time_entries
)
SELECT id, keep_id FROM ranked WHERE rn > 1;

-- 3) Relatorio ANTES
SELECT 'ANTES' AS momento,
       (SELECT COUNT(*) FROM time_entries)                          AS total_entries,
       (SELECT COUNT(*) FROM dups_to_remove)                        AS a_remover,
       (SELECT ROUND(SUM(minutes)/60.0,1) FROM time_entries
         WHERE id IN (SELECT id FROM dups_to_remove))               AS horas_a_remover;

-- 4) Guarda copia dos que serao removidos
INSERT INTO time_entries_removed_duplicates
SELECT te.*, now(), d.keep_id
FROM time_entries te
JOIN dups_to_remove d ON d.id = te.id;

-- 5) Remove
DELETE FROM time_entries
WHERE id IN (SELECT id FROM dups_to_remove);

-- 6) Relatorio DEPOIS
SELECT 'DEPOIS' AS momento,
       (SELECT COUNT(*) FROM time_entries)                              AS total_entries,
       (SELECT COUNT(*) FROM time_entries_removed_duplicates)           AS em_auditoria,
       (SELECT COUNT(*) FROM (
          SELECT 1 FROM time_entries
          GROUP BY technician_id, DATE(work_date), source, minutes,
                   LOWER(COALESCE(notes,''))
          HAVING COUNT(*)>1) x)                                        AS duplicatas_restantes;

COMMIT;
