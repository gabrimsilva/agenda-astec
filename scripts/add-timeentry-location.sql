ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS location text;

-- Backfill: deslocamentos (ida/volta) = "Trajeto"
UPDATE time_entries
SET location = 'Trajeto'
WHERE location IS NULL
  AND source IN ('ida_travel', 'volta_travel');

-- Backfill: execução vinculada a uma atividade = "Executado em" da atividade
UPDATE time_entries te
SET location = a.location
FROM activities a
WHERE te.location IS NULL
  AND te.agenda_activity_id = a.id
  AND a.location IS NOT NULL;
