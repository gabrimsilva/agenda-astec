import { neon } from '@neondatabase/serverless';

const sql = neon('postgresql://neondb_owner:npg_TEmNFius6W0n@ep-dark-credit-ae6dljaq.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require');

(async () => {
  try {
    console.log('\n🔍 Buscando RATs pendentes sem PDF...\n');

    // Buscar RATs pendentes que NÃO têm PDF importado
    const pendentRats = await sql`
      SELECT id, report_number, client_name, created_at
      FROM rats
      WHERE status = 'pendente' 
        AND imported_pdf_url IS NULL
      ORDER BY created_at DESC
    `;

    console.log(`📋 Encontradas ${pendentRats.length} RATs pendentes sem PDF\n`);

    if (pendentRats.length === 0) {
      console.log('✅ Nenhuma RAT pendente para remover!');
      return;
    }

    // Listar as RATs que serão deletadas
    console.log('RATs que serão DELETADAS:');
    console.log('═'.repeat(80));
    pendentRats.forEach((rat, idx) => {
      console.log(`${idx + 1}. ${rat.report_number} - ${rat.client_name}`);
    });

    console.log('═'.repeat(80));
    console.log(`\n⚠️  CONFIRMAÇÃO: Deletar ${pendentRats.length} RATs pendentes? (s/n)\n`);

    // Para script não-interativo, confirma automaticamente após 2 segundos
    console.log('Confirmando automaticamente em 2 segundos...');
    
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Deletar as RATs
    console.log('\n🗑️  Deletando RATs pendentes...\n');

    let deleted = 0;
    for (const rat of pendentRats) {
      try {
        await sql`
          DELETE FROM rats
          WHERE id = ${rat.id}
        `;
        console.log(`✅ Deletada: ${rat.report_number}`);
        deleted++;
      } catch (error) {
        console.error(`❌ Erro ao deletar ${rat.report_number}: ${error.message}`);
      }
    }

    console.log(`\n\n📊 RESUMO:`);
    console.log(`✅ Deletadas: ${deleted} RATs`);
    console.log(`❌ Erros: ${pendentRats.length - deleted}`);

    // Estatísticas finais
    console.log(`\n\n📈 STATUS FINAL DO BANCO:\n`);
    
    const finalStats = await sql`
      SELECT 
        status, 
        COUNT(*) as count
      FROM rats
      GROUP BY status
      ORDER BY status
    `;

    console.log('Distribuição de RATs por status:');
    finalStats.forEach(row => {
      const bar = '█'.repeat(Math.ceil(row.count / 5));
      console.log(`  ${row.status.padEnd(12)}: ${bar} ${row.count}`);
    });

    const totalRats = finalStats.reduce((sum, row) => sum + row.count, 0);
    console.log(`\nTotal de RATs: ${totalRats}`);

  } catch (error) {
    console.error('❌ Erro:', error.message);
  }
})();
