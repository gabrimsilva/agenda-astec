import { neon } from '@neondatabase/serverless';

const sql = neon('postgresql://neondb_owner:npg_TEmNFius6W0n@ep-dark-credit-ae6dljaq.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require');

(async () => {
  try {
    console.log('Verificando status disponíveis...\n');
    
    // Verificar o tipo de dados e valores possíveis
    const result = await sql`
      SELECT DISTINCT status FROM rats LIMIT 10;
    `;
    console.log('Status encontrados na tabela:');
    result.forEach(r => console.log(`  - ${r.status}`));
    
    console.log('\n\nRATs com PDFs importados:');
    // Listar as RATs com PDFs
    const rats = await sql`
      SELECT 
        id, 
        report_number, 
        client_name, 
        status, 
        imported_pdf_filename 
      FROM rats 
      WHERE imported_pdf_url IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 10;
    `;
    
    rats.forEach(rat => {
      console.log(`  ID: ${rat.id} | Número: ${rat.report_number} | Status: ${rat.status} | Cliente: ${rat.client_name}`);
    });
    
  } catch (error) {
    console.error('Erro:', error.message);
  }
})();
