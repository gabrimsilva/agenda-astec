// Excluir atividades específicas que ainda aparecem
import pg from 'pg';
const { Client } = pg;

const DATABASE_URL = 'postgresql://astec:astec@db:5432/astec';

async function deleteSpecificActivities() {
  const client = new Client({ connectionString: DATABASE_URL });
  
  try {
    await client.connect();
    console.log('✅ Conectado ao banco de dados\n');
    
    // Buscar as atividades específicas
    const searchResult = await client.query(`
      SELECT 
        a.id,
        a.client_name,
        a.scheduled_date,
        a.status,
        r.id as rat_id
      FROM activities a
      LEFT JOIN rats r ON r.activity_id = a.id
      WHERE (
        (a.client_name LIKE '%Volcan%' AND a.scheduled_date::date = '2026-02-25')
        OR
        (a.client_name LIKE '%STOCK MINAS%' AND a.scheduled_date::date = '2026-02-23')
      )
      ORDER BY a.scheduled_date DESC
    `);
    
    console.log(`📋 Atividades encontradas: ${searchResult.rows.length}\n`);
    
    if (searchResult.rows.length === 0) {
      console.log('✅ Nenhuma atividade encontrada para excluir.');
      return;
    }
    
    // Mostrar detalhes
    searchResult.rows.forEach((row, i) => {
      const date = new Date(row.scheduled_date);
      console.log(`${i + 1}. ${row.client_name}`);
      console.log(`   Data: ${date.toLocaleDateString('pt-BR')}`);
      console.log(`   Status: ${row.status}`);
      console.log(`   Tem RAT: ${row.rat_id ? 'SIM' : 'NÃO'}`);
      console.log(`   ID: ${row.id}\n`);
    });
    
    // Filtrar apenas as que NÃO têm RAT
    const activitiesToDelete = searchResult.rows.filter(row => !row.rat_id);
    
    console.log(`\n🗑️  Atividades SEM RAT para excluir: ${activitiesToDelete.length}\n`);
    
    if (activitiesToDelete.length === 0) {
      console.log('⚠️  Todas as atividades encontradas JÁ TÊM RAT associada.');
      console.log('   Não é possível excluir atividades que já possuem RAT.');
      return;
    }
    
    const activityIds = activitiesToDelete.map(a => a.id);
    
    // Excluir time_entries primeiro
    const deleteTimeEntriesResult = await client.query(`
      DELETE FROM time_entries
      WHERE agenda_activity_id = ANY($1)
    `, [activityIds]);
    
    console.log(`   ✅ ${deleteTimeEntriesResult.rowCount} registros de tempo excluídos`);
    
    // Excluir atividades
    const deleteResult = await client.query(`
      DELETE FROM activities
      WHERE id = ANY($1)
    `, [activityIds]);
    
    console.log(`   ✅ ${deleteResult.rowCount} atividades excluídas\n`);
    
    console.log('========================================');
    console.log('✅ OPERAÇÃO CONCLUÍDA!');
    console.log('========================================\n');
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
  } finally {
    await client.end();
  }
}

deleteSpecificActivities();
