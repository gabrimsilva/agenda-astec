import { neon } from '@neondatabase/serverless';

const sql = neon('postgresql://neondb_owner:npg_TEmNFius6W0n@ep-dark-credit-ae6dljaq.c-2.us-east-2.aws.neon.tech/neondb?sslmode=require');

(async () => {
  try {
    const rats = await sql`
      SELECT id, report_number, client_name, technician_id, status, 
             imported_pdf_filename, imported_pdf_url, opening_date, created_at
      FROM rats 
      WHERE imported_pdf_url IS NOT NULL
      ORDER BY created_at DESC 
      LIMIT 30
    `;
    
    console.log('RATs with imported PDFs in Replit:');
    console.log(JSON.stringify(rats, null, 2));
  } catch (error) {
    console.error('Error:', error);
  }
})();
