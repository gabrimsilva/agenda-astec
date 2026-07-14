import { neon } from '@neondatabase/serverless';
import fs from 'fs';
import path from 'path';

const sql = neon('postgresql://neondb_owner:npg_TEmNFius6W0n@ep-dark-credit-ae6dljaq.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require');

// Diretório com os PDFs extraídos
const pdfDir = 'C:\\Users\\gmsilva\\Desktop\\SISTEMAS\\_RODANDO\\astec-project\\extracted-pdfs';

(async () => {
  try {
    console.log('\n🔍 Analisando PDFs extraídos...\n');
    
    // Listar todos os PDFs no diretório
    const files = fs.readdirSync(pdfDir).filter(f => f.endsWith('.pdf'));
    console.log(`📂 Encontrados ${files.length} PDFs para importar\n`);

    let imported = 0;
    let skipped = 0;
    let errors = 0;

    for (const file of files) {
      try {
        // Extrair número da RAT do nome do arquivo
        // Formato: RAT_RAT-2026-0371_ED_COLOR.pdf
        const match = file.match(/RAT_(RAT-\d{4}-\d{4})/);
        
        if (!match) {
          console.log(`⚠️  Pulando ${file} (não conseguiu extrair número da RAT)`);
          skipped++;
          continue;
        }

        const reportNumber = match[1]; // Ex: RAT-2026-0371
        
        // Verificar se a RAT existe no banco
        const ratQuery = await sql`
          SELECT id, report_number, client_name, status, imported_pdf_url
          FROM rats
          WHERE report_number = ${reportNumber}
        `;

        if (ratQuery.length === 0) {
          console.log(`⚠️  RAT não encontrada no banco: ${reportNumber}`);
          skipped++;
          continue;
        }

        const rat = ratQuery[0];

        // Se já tem PDF importado, pular
        if (rat.imported_pdf_url) {
          console.log(`✓ ${reportNumber} - JÁ tem PDF importado (pulando)`);
          skipped++;
          continue;
        }

        // Ler o PDF e converter para base64
        const filePath = path.join(pdfDir, file);
        const pdfBuffer = fs.readFileSync(filePath);
        const pdfBase64 = `data:application/pdf;base64,${pdfBuffer.toString('base64')}`;

        // Atualizar a RAT com o PDF importado
        const updateData = {
          imported_pdf_url: pdfBase64,
          imported_pdf_filename: file,
        };

        // Se está em "pendente", muda para "rascunho"
        if (rat.status === 'pendente') {
          updateData.status = 'rascunho';
        }

        // Executar UPDATE
        await sql`
          UPDATE rats
          SET 
            imported_pdf_url = ${updateData.imported_pdf_url},
            imported_pdf_filename = ${updateData.imported_pdf_filename},
            status = COALESCE(${updateData.status}, status),
            updated_at = NOW()
          WHERE id = ${rat.id}
        `;

        console.log(`✅ ${reportNumber} - ${rat.client_name}`);
        console.log(`   📄 ${file} (${(pdfBuffer.length / 1024 / 1024).toFixed(2)} MB)`);
        console.log(`   📊 Status: ${rat.status} → ${updateData.status || rat.status}`);
        imported++;

      } catch (error) {
        console.error(`❌ Erro ao processar ${file}:`, error.message);
        errors++;
      }
    }

    console.log(`\n\n📊 RESUMO DA IMPORTAÇÃO:`);
    console.log(`✅ Importadas: ${imported}`);
    console.log(`⚠️  Puladas: ${skipped}`);
    console.log(`❌ Erros: ${errors}`);
    console.log(`📈 Total processado: ${files.length}`);

    // Estatísticas finais
    console.log(`\n\n📈 ESTATÍSTICAS DO BANCO:`);
    
    const statusCounts = await sql`
      SELECT status, COUNT(*) as count
      FROM rats
      GROUP BY status
      ORDER BY status
    `;
    
    console.log(`\nDistribuição de status das RATs:`);
    statusCounts.forEach(row => {
      console.log(`  ${row.status}: ${row.count}`);
    });

    const withPdfCount = await sql`
      SELECT COUNT(*) as count
      FROM rats
      WHERE imported_pdf_url IS NOT NULL
    `;

    console.log(`\n📄 RATs com PDF importado: ${withPdfCount[0].count}`);

  } catch (error) {
    console.error('❌ Erro geral:', error.message);
  }
})();
