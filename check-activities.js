// Verificar se as atividades específicas ainda existem
import pg from 'pg';
const { Client } = pg;

const DATABASE_URL = 'postgresql://astec:astec@db:5432/astec';

async function checkActivities() {
  const client = new Client({ connectionString: DATABASE_URL });
  
  try {
    await client.connect();
    console.log('✅ Conectado ao banco de dados\n');
    
    // Verificar atividades específicas
    const result = await client.query(`
      SELECT 
        a.id,
        a.client_name,
        a.scheduled_date,
        a.status,
        a.work_completed,
        r.id as rat_id
      FROM activities a
      LEFT JOIN rats r ON r.activity_id = a.id
      WHERE (
        a.client_name LIKE '%Volcan%' 
        OR a.client_name LIKE '%STOCK MINAS%'
      )
      AND a.scheduled_date BETWEEN '2026-02-20' AND '2026-02-28'
      ORDER BY a.scheduled_date DESC
    `);
    
    console.log(`📋 Atividades encontradas: ${result.rows.length}\n`);
    
    if (result.rows.length === 0) {
      console.log('✅ Nenhuma atividade Volcan ou STOCK MINAS encontrada (foram excluídas)');
    } else {
      console.log('Atividades ainda no banco:\n');
      result.rows.forEach((row, i) => {
        const date = new Date(row.scheduled_date);
        console.log(`${i + 1}. ${row.client_name}`);
        console.log(`   Data: ${date.toLocaleDateString('pt-BR')}`);
        console.log(`   Status: ${row.status}`);
        console.log(`   Work Completed: ${row.work_completed}`);
        console.log(`   Tem RAT: ${row.rat_id ? 'SIM' : 'NÃO'}`);
        console.log(`   ID: ${row.id}\n`);
      });
    }
    
    // Contar todas as atividades antigas sem RAT
    const countResult = await client.query(`
      SELECT COUNT(*) as total
      FROM activities a
      LEFT JOIN rats r ON r.activity_id = a.id
      WHERE a.status = 'concluido'
        AND a.work_completed = true
        AND a.scheduled_date <= '2026-02-23 23:59:59'
        AND r.id IS NULL
    `);
    
    console.log(`\n📊 Total de atividades antigas sem RAT: ${countResult.rows[0].total}`);
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
  } finally {
    await client.end();
  }
}

checkActivities();
