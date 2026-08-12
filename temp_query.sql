-- Verificar qual técnico pertence ao usuário administrador
SELECT t.id as technician_id, t.name as technician_name, u.username, u.role
FROM technicians t
JOIN users u ON u.id = t.user_id
WHERE u.role = 'admin';
