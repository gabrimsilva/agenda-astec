import { neon } from '@neondatabase/serverless';
import fs from 'fs';
import path from 'path';

const sql = neon('postgresql://neondb_owner:npg_TEmNFius6W0n@ep-dark-credit-ae6dljaq.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require');

// Diretório para salvar os PDFs
const outputDir = 'C:\\Users\\gmsilva\\Desktop\\SISTEMAS\\_RODANDO\\astec-project\\extracted-pdfs';

// Criar diretório se não existir
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
  console.log(`✅ Diretório criado: ${outputDir}`);
}

(async () => {
  try {
    // Primeiro, buscar apenas os IDs das RATs com PDFs (sem trazer o PDF)
    console.log('\n🔍 Buscando RATs com PDFs importados...\n');
    
    const ratIds = await sql`
      SELECT 
        id, 
        report_number, 
        client_name, 
        status, 
        imported_pdf_filename 
      FROM rats 
      WHERE imported_pdf_url IS NOT NULL
      ORDER BY created_at DESC
    `;

    console.log(`📊 Encontradas ${ratIds.length} RATs com PDFs importados\n`);

    for (const ratInfo of ratIds) {
      console.log(`\n📄 Processando RAT ID: ${ratInfo.id}`);
      console.log(`   Número: ${ratInfo.report_number}`);
      console.log(`   Cliente: ${ratInfo.client_name}`);
      console.log(`   Status: ${ratInfo.status}`);
      console.log(`   Arquivo: ${ratInfo.imported_pdf_filename}`);

      try {
        // Buscar apenas o PDF desta RAT específica
        const ratData = await sql`
          SELECT imported_pdf_url
          FROM rats 
          WHERE id = ${ratInfo.id}
        `;

        if (ratData.length > 0 && ratData[0].imported_pdf_url) {
          // O PDF já está em base64 no banco
          const pdfBuffer = Buffer.from(ratData[0].imported_pdf_url, 'base64');
          
          // Criar nome do arquivo seguro
          const safeFilename = `RAT_${ratInfo.report_number}_${ratInfo.client_name.replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;
          const filePath = path.join(outputDir, safeFilename);
          
          // Salvar o PDF
          fs.writeFileSync(filePath, pdfBuffer);
          
          console.log(`   ✅ PDF extraído com sucesso!`);
          console.log(`   📍 Nome: ${safeFilename}`);
          console.log(`   💾 Tamanho: ${(pdfBuffer.length / 1024).toFixed(2)} KB`);
        }
      } catch (error) {
        console.error(`   ❌ Erro ao extrair PDF: ${error.message}`);
      }
    }

    console.log(`\n\n✨ Processo concluído!`);
    console.log(`📁 PDFs salvos em: ${outputDir}`);
    
    // Listar os arquivos extraídos
    const files = fs.readdirSync(outputDir);
    console.log(`\n📂 Arquivos extraídos (${files.length}):`);
    files.forEach(file => {
      const filePath = path.join(outputDir, file);
      const stats = fs.statSync(filePath);
      console.log(`   - ${file} (${(stats.size / 1024).toFixed(2)} KB)`);
    });

  } catch (error) {
    console.error('❌ Erro:', error);
  }
})();
