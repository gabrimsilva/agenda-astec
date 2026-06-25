-- Script para limpar o banco de dados mantendo apenas os usuários
-- ATENÇÃO: Este script deleta TODOS os dados exceto usuários e técnicos!

-- 1. Deletar entradas de tempo (time_entries) - depende de travel_segments e activities
DELETE FROM time_entries;

-- 2. Deletar segmentos de viagem (travel_segments)
DELETE FROM travel_segments;

-- 3. Deletar atividades (activities) - depende de clients e activity_types
DELETE FROM activities;

-- 4. Deletar aprovações (approvals) se existirem
DELETE FROM approvals;

-- 5. Deletar localizações de técnicos (technician_locations)
DELETE FROM technician_locations;

-- 6. Deletar sites de clientes (client_sites) - depende de clients
DELETE FROM client_sites;

-- 7. Deletar clientes (clients)
DELETE FROM clients;

-- 8. Deletar tipos de atividades (activity_types)
DELETE FROM activity_types;

-- 9. Deletar business types e regions se existirem
DELETE FROM business_types;
DELETE FROM regions;

-- MANTIDOS: users e technicians (vinculados aos users)

SELECT 'Limpeza concluída! Mantidos apenas usuários e técnicos.' as status;
