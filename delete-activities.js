// Script para excluir atividades antigas sem RAT do banco
import pg from 'pg';
const { Client } = pg;

const DATABASE_URL = 'postgresql://astec:astec@db:5432/astec';

async function deleteOldActivities() {
  const client = new Client({ connectionString: DATABASE_URL });
  
  try {
    await client.connect();
    console.log('✅ Conectado ao banco de dados\n');
    
    // 1. Contar atividades
    const countResult = await client.query(`
      SELECT COUNT(*) as total
      FROM activities a
      LEFT JOIN rats r ON r.activity_id = a.id
      WHERE a.status = 'concluido'
        AND a.work_completed = true
        AND a.scheduled_date <= '2026-02-23 23:59:59'
        AND r.id IS NULL
    `);
    
    const total = parseInt(countResult.rows[0].total);
    console.log(`📊 Atividades encontradas: ${total}\n`);
    
    if (total === 0) {
      console.log('✅ Nenhuma atividade para excluir.');
      await client.end();
      return;
    }
    
    // 2. Listar atividades
    const listResult = await client.query(`
      SELECT 
        a.client_name,
        TO_CHAR(a.scheduled_date, 'DD/MM/YYYY') as data
      FROM activities a
      LEFT JOIN rats r ON r.activity_id = a.id
      WHERE a.status = 'concluido'
        AND a.work_completed = true
        AND a.scheduled_date <= '2026-02-23 23:59:59'
        AND r.id IS NULL
      ORDER BY a.scheduled_date DESC
      LIMIT 10
    `);
    
    console.log('📋 Atividades que serão excluídas (primeiras 10):');
    listResult.rows.forEach((row, i) => {
      console.log(`   ${i + 1}. ${row.client_name} - ${row.data}`);
    });
    
    if (total > 10) {
      console.log(`   ... e mais ${total - 10} atividades`);
    }
    
    console.log('\n🗑️  Excluindo registros relacionados e atividades...\n');
    
    // 3a. Primeiro excluir time_entries relacionados
    const deleteTimeEntriesResult = await client.query(`
      DELETE FROM time_entries
      WHERE agenda_activity_id IN (
        SELECT a.id
        FROM activities a
        LEFT JOIN rats r ON r.activity_id = a.id
        WHERE a.status = 'concluido'
          AND a.work_completed = true
          AND a.scheduled_date <= '2026-02-23 23:59:59'
          AND r.id IS NULL
      )
    `);
    
    console.log(`   ✅ ${deleteTimeEntriesResult.rowCount} registros de tempo excluídos`);
    
    // 3b. EXCLUIR ATIVIDADES
    const deleteResult = await client.query(`
      DELETE FROM activities
      WHERE id IN (
        SELECT a.id
        FROM activities a
        LEFT JOIN rats r ON r.activity_id = a.id
        WHERE a.status = 'concluido'
          AND a.work_completed = true
          AND a.scheduled_date <= '2026-02-23 23:59:59'
          AND r.id IS NULL
      )
    `);
    
    console.log(`   ✅ ${deleteResult.rowCount} atividades excluídas\n`);
    
    // 4. Verificar
    const verifyResult = await client.query(`
      SELECT COUNT(*) as restantes
      FROM activities
      WHERE status = 'concluido'
        AND scheduled_date <= '2026-02-23 23:59:59'
    `);
    
    console.log(`📊 Atividades antigas restantes: ${verifyResult.rows[0].restantes}`);
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

deleteOldActivities();
