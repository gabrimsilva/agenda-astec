DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'activity_categorization') THEN
    CREATE TYPE activity_categorization AS ENUM ('administrativo','visita_tecnica','deslocamento','qualificacao','ociosidade');
  END IF;
END
$do$;

ALTER TABLE activities ADD COLUMN IF NOT EXISTS categorization activity_categorization;
