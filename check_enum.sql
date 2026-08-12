-- Verificar valores válidos do enum time_record_type
SELECT enumlabel 
FROM pg_enum 
JOIN pg_type ON pg_enum.enumtypid = pg_type.oid 
WHERE pg_type.typname = 'time_record_type';

-- Verificar registros existentes na tabela
SELECT DISTINCT record_type 
FROM activity_time_records 
ORDER BY record_type;
