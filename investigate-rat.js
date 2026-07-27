// Investigar RAT específica
import pg from 'pg';
const { Client } = pg;

const DATABASE_URL = 'postgresql://astec:astec@db:5432/astec';

async function investigateRat() {
  const client = new Client({ connectionString: DATABASE_URL });
  
  try {
    await client.connect();
    console.log('✅ Conectado ao banco de dados\n');
    
    // Buscar RAT específica
    const ratResult = await client.query(`
      SELECT 
        r.*,
        a.scheduled_date as activity_date,
        a.status as activity_status,
        a.work_completed,
        a.client_name as activity_client_name,
        at.name as activity_type_name,
        t.name as technician_name
      FROM rats r
      LEFT JOIN activities a ON r.activity_id = a.id
      LEFT JOIN activity_types at ON a.activity_type_id = at.id
      LEFT JOIN technicians t ON r.technician_id = t.id
      WHERE r.report_number = 'RAT-2026-0390'
    `);
    
    if (ratResult.rows.length === 0) {
      console.log('❌ RAT-2026-0390 não encontrada');
      return;
    }
    
    const rat = ratResult.rows[0];
    
    console.log('📋 DETALHES DA RAT RAT-2026-0390:\n');
    console.log(`Número: ${rat.report_number}`);
    console.log(`Cliente: ${rat.client_name}`);
    console.log(`Status RAT: ${rat.status}`);
    console.log(`Enviada em: ${rat.sent_at ? new Date(rat.sent_at).toLocaleString('pt-BR') : 'NÃO ENVIADA'}`);
    console.log(`Criada em: ${new Date(rat.created_at).toLocaleString('pt-BR')}`);
    console.log(`Data de abertura (openDate): ${new Date(rat.open_date).toLocaleString('pt-BR')}`);
    console.log(`\n--- ATIVIDADE ASSOCIADA ---`);
    console.log(`ID da atividade: ${rat.activity_id}`);
    console.log(`Cliente da atividade: ${rat.activity_client_name}`);
    console.log(`Data agendada: ${rat.activity_date ? new Date(rat.activity_date).toLocaleDateString('pt-BR') : 'N/A'}`);
    console.log(`Status da atividade: ${rat.activity_status}`);
    console.log(`Trabalho completo: ${rat.work_completed}`);
    console.log(`Tipo de atividade: ${rat.activity_type_name}`);
    console.log(`Técnico: ${rat.technician_name}`);
    
    // Verificar se a atividade está na lista de tipos que exigem RAT
    const typesRequiringRat = [
      "Visita técnica (corretiva ou RCs)",
      "Visitas técnicas (Preventiva ou teste)",
      "Preventivas",
      "Visitas técnicas ",
      "Teste",
      "Reclamação"
    ];
    
    const requiresRat = typesRequiringRat.includes(rat.activity_type_name);
    
    console.log(`\n--- ANÁLISE ---`);
    console.log(`Tipo requer RAT: ${requiresRat ? 'SIM' : 'NÃO'}`);
    console.log(`Data da atividade é antiga (≤ 23/02/2026): ${new Date(rat.activity_date) <= new Date('2026-02-23 23:59:59') ? 'SIM' : 'NÃO'}`);
    
    // Verificar se existem outras RATs para mesma atividade
    const duplicateCheck = await client.query(`
      SELECT COUNT(*) as total
      FROM rats
      WHERE activity_id = $1
    `, [rat.activity_id]);
    
    console.log(`\nRATs para esta atividade: ${duplicateCheck.rows[0].total}`);
    
    if (parseInt(duplicateCheck.rows[0].total) > 1) {
      console.log('⚠️  ATENÇÃO: Existem múltiplas RATs para a mesma atividade!');
      
      const allRats = await client.query(`
        SELECT report_number, status, created_at, sent_at
        FROM rats
        WHERE activity_id = $1
        ORDER BY created_at DESC
      `, [rat.activity_id]);
      
      console.log('\nTodas as RATs desta atividade:');
      allRats.rows.forEach((r, i) => {
        console.log(`  ${i + 1}. ${r.report_number} - ${r.status} - Criada: ${new Date(r.created_at).toLocaleDateString('pt-BR')}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
  } finally {
    await client.end();
  }
}

investigateRat();
