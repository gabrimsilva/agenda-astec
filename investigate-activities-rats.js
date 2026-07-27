// Investigar as atividades que aparecem como "sem RAT"
import pg from 'pg';
const { Client } = pg;

const DATABASE_URL = 'postgresql://astec:astec@db:5432/astec';

async function investigateActivitiesRats() {
  const client = new Client({ connectionString: DATABASE_URL });
  
  try {
    await client.connect();
    console.log('✅ Conectado ao banco de dados\n');
    
    // Buscar as atividades específicas com suas RATs
    const result = await client.query(`
      SELECT 
        a.id as activity_id,
        a.client_name,
        a.scheduled_date,
        a.status,
        a.work_completed,
        r.id as rat_id,
        r.report_number,
        r.status as rat_status,
        at.name as activity_type
      FROM activities a
      LEFT JOIN rats r ON r.activity_id = a.id
      LEFT JOIN activity_types at ON a.activity_type_id = at.id
      WHERE (
        (a.client_name LIKE '%Volcan%' AND a.scheduled_date::date = '2026-02-25')
        OR
        (a.client_name LIKE '%STOCK MINAS%' AND a.scheduled_date::date = '2026-02-23')
      )
      ORDER BY a.scheduled_date DESC, a.client_name
    `);
    
    console.log(`📋 Total de atividades encontradas: ${result.rows.length}\n`);
    
    if (result.rows.length === 0) {
      console.log('❌ Nenhuma atividade encontrada com esses critérios.');
      return;
    }
    
    // Mostrar detalhes de cada atividade
    result.rows.forEach((row, i) => {
      const date = new Date(row.scheduled_date);
      console.log(`\n${i + 1}. ══════════════════════════════════════════`);
      console.log(`   Cliente: ${row.client_name}`);
      console.log(`   Data: ${date.toLocaleDateString('pt-BR')}`);
      console.log(`   Status: ${row.status}`);
      console.log(`   Trabalho Concluído: ${row.work_completed ? 'SIM' : 'NÃO'}`);
      console.log(`   Tipo de Atividade: ${row.activity_type || 'N/A'}`);
      console.log(`   Activity ID: ${row.activity_id}`);
      console.log(`   ───────────────────────────────────────────`);
      console.log(`   Tem RAT: ${row.rat_id ? 'SIM ✅' : 'NÃO ❌'}`);
      if (row.rat_id) {
        console.log(`   RAT ID: ${row.rat_id}`);
        console.log(`   RAT Number: ${row.report_number}`);
        console.log(`   RAT Status: ${row.rat_status}`);
      }
    });
    
    // Resumo
    const withRat = result.rows.filter(r => r.rat_id);
    const withoutRat = result.rows.filter(r => !r.rat_id);
    
    console.log(`\n\n${'='.repeat(50)}`);
    console.log('RESUMO:');
    console.log(`${'='.repeat(50)}`);
    console.log(`Total de atividades: ${result.rows.length}`);
    console.log(`Com RAT: ${withRat.length}`);
    console.log(`Sem RAT: ${withoutRat.length}`);
    
    if (withoutRat.length > 0) {
      console.log(`\n⚠️  Atividades SEM RAT que deveriam ser excluídas:`);
      withoutRat.forEach(r => {
        console.log(`   - ${r.client_name} (${new Date(r.scheduled_date).toLocaleDateString('pt-BR')})`);
      });
    }
    
    if (withRat.length > 0) {
      console.log(`\n✅ Atividades COM RAT (não devem aparecer na lista "sem RAT"):`);
      withRat.forEach(r => {
        console.log(`   - ${r.client_name} (${new Date(r.scheduled_date).toLocaleDateString('pt-BR')}) → RAT ${r.report_number}`);
      });
    }
    
    // Verificar se existem outras RATs para essas atividades (pode haver duplicação de activity_id)
    console.log(`\n\n${'='.repeat(50)}`);
    console.log('VERIFICANDO MÚLTIPLAS RATs POR ATIVIDADE:');
    console.log(`${'='.repeat(50)}`);
    
    const activityIds = result.rows.map(r => r.activity_id);
    const multiRatCheck = await client.query(`
      SELECT 
        activity_id,
        COUNT(*) as rat_count,
        array_agg(id) as rat_ids,
        array_agg(report_number) as report_numbers
      FROM rats
      WHERE activity_id = ANY($1)
      GROUP BY activity_id
      HAVING COUNT(*) > 1
    `, [activityIds]);
    
    if (multiRatCheck.rows.length > 0) {
      console.log(`\n⚠️  Encontradas ${multiRatCheck.rows.length} atividades com MÚLTIPLAS RATs:`);
      multiRatCheck.rows.forEach(r => {
        const activity = result.rows.find(a => a.activity_id === r.activity_id);
        console.log(`\n   Activity: ${activity?.client_name} (${activity?.activity_id})`);
        console.log(`   Total de RATs: ${r.rat_count}`);
        console.log(`   RAT IDs: ${r.rat_ids.join(', ')}`);
        console.log(`   RAT Numbers: ${r.report_numbers.join(', ')}`);
      });
    } else {
      console.log('\n✅ Nenhuma atividade com múltiplas RATs encontrada.');
    }
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
  } finally {
    await client.end();
  }
}

investigateActivitiesRats();
