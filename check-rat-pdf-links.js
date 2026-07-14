import { neon } from '@neondatabase/serverless';

const sql = neon('postgresql://neondb_owner:npg_TEmNFius6W0n@ep-dark-credit-ae6dljaq.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require');

(async () => {
  try {
    console.log('\n🔍 VERIFICANDO VÍNCULOS ENTRE RATs, ATIVIDADES E PDFs...\n');

    // Buscar RATs com PDFs e suas atividades associadas
    const ratsWithPdfs = await sql`
      SELECT 
        r.id as rat_id,
        r.report_number,
        r.client_name,
        r.status,
        r.imported_pdf_filename,
        r.imported_pdf_url IS NOT NULL as has_pdf,
        a.id as activity_id,
        a.title as activity_title,
        a.scheduled_date,
        a.status as activity_status,
        t.name as technician_name
      FROM rats r
      LEFT JOIN activities a ON r.activity_id = a.id
      LEFT JOIN technicians t ON r.technician_id = t.id
      WHERE r.imported_pdf_url IS NOT NULL
      ORDER BY r.created_at DESC
      LIMIT 10
    `;

    console.log(`📊 AMOSTRA: Primeiras 10 RATs com PDFs Importados\n`);
    console.log('═'.repeat(100));

    ratsWithPdfs.forEach((rat, idx) => {
      console.log(`\n${idx + 1}. RAT #${rat.report_number}`);
      console.log(`   Cliente: ${rat.client_name}`);
      console.log(`   Status RAT: ${rat.status}`);
      console.log(`   PDF: ${rat.imported_pdf_filename || '(sem nome)'}`);
      console.log(`   \n   ↓ VINCULADA À ATIVIDADE:`);
      console.log(`   ID Atividade: ${rat.activity_id || 'N/A'}`);
      console.log(`   Título: ${rat.activity_title || 'N/A'}`);
      console.log(`   Data: ${rat.scheduled_date ? new Date(rat.scheduled_date).toLocaleDateString('pt-BR') : 'N/A'}`);
      console.log(`   Status: ${rat.activity_status || 'N/A'}`);
      console.log(`   Técnico: ${rat.technician_name || 'N/A'}`);
    });

    // Estatísticas gerais
    console.log(`\n\n${'═'.repeat(100)}`);
    console.log('\n📈 ESTATÍSTICAS GERAIS\n');

    const stats = await sql`
      SELECT 
        COUNT(*) as total_rats,
        COUNT(CASE WHEN imported_pdf_url IS NOT NULL THEN 1 END) as rats_com_pdf,
        COUNT(CASE WHEN activity_id IS NOT NULL THEN 1 END) as rats_com_atividade,
        COUNT(CASE WHEN imported_pdf_url IS NOT NULL AND activity_id IS NOT NULL THEN 1 END) as rats_completas_vinculadas
      FROM rats
    `;

    console.log(`Total de RATs: ${stats[0].total_rats}`);
    console.log(`RATs com PDF importado: ${stats[0].rats_com_pdf} (${((stats[0].rats_com_pdf / stats[0].total_rats) * 100).toFixed(1)}%)`);
    console.log(`RATs com Atividade vinculada: ${stats[0].rats_com_atividade} (${((stats[0].rats_com_atividade / stats[0].total_rats) * 100).toFixed(1)}%)`);
    console.log(`RATs completas (PDF + Atividade): ${stats[0].rats_completas_vinculadas}`);

    // Endpoints de acesso
    console.log(`\n\n${'═'.repeat(100)}`);
    console.log('\n🔗 ENDPOINTS PARA ACESSAR OS PDFs\n');
    
    console.log('Para uma RAT específica, use:\n');
    console.log('📥 DOWNLOAD do PDF importado:');
    console.log('   GET /api/rats/{RAT_ID}/download-imported-pdf');
    console.log('   Exemplo: GET /api/rats/abc123.../download-imported-pdf\n');
    
    console.log('📄 VISUALIZAR RAT como HTML:');
    console.log('   GET /api/rats/{RAT_ID}/preview\n');
    
    console.log('📋 GERAR PDF (se preenchida manualmente):');
    console.log('   GET /api/rats/{RAT_ID}/pdf\n');

    console.log('📤 ENVIAR RAT via WhatsApp/Email:');
    console.log('   POST /api/rats/{RAT_ID}/send');
    console.log('   Body: { "channel": "whatsapp" ou "email" ou "ambos" }\n');

    // Tabela de status
    console.log(`\n${'═'.repeat(100)}`);
    console.log('\n📊 DISTRIBUIÇÃO DE STATUS\n');

    const statusDist = await sql`
      SELECT status, COUNT(*) as count
      FROM rats
      GROUP BY status
      ORDER BY count DESC
    `;

    statusDist.forEach(row => {
      const bar = '█'.repeat(Math.ceil(row.count / 2));
      console.log(`  ${row.status.padEnd(12)}: ${bar} ${row.count}`);
    });

    console.log(`\n\n✅ PRÓXIMOS PASSOS:\n`);
    console.log('1. Os PDFs estão VINCULADOS às RATs no banco');
    console.log('2. As RATs estão VINCULADAS às atividades através do campo activity_id');
    console.log('3. Use o endpoint GET /api/rats/{RAT_ID}/download-imported-pdf para acessar o PDF');
    console.log('4. Integre na UI através de links para download automático\n');

  } catch (error) {
    console.error('❌ Erro:', error.message);
  }
})();
