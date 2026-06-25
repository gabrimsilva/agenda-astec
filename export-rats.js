const { Pool } = require('@neondatabase/serverless');
const fs = require('fs');

async function exportRats() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  const result = await pool.query(`
    SELECT r.id, r.report_number, r.report_number_manual, r.activity_id, r.technician_id, 
           r.client_id, r.client_name, r.client_name_editable, r.status, r.type,
           r.form_data, r.pdf_url, r.sent_at, r.send_channel, r.close_date,
           r.created_at, r.updated_at,
           t.name as technician_name
    FROM rats r
    LEFT JOIN technicians t ON r.technician_id = t.id
    ORDER BY r.created_at DESC
  `);
  
  if (result.rows.length === 0) {
    console.log('Nenhuma RAT encontrada');
    await pool.end();
    return;
  }
  
  // CSV export (without form_data for readability)
  const csvHeaders = ['report_number','report_number_manual','technician_name','client_name','status','type','sent_at','send_channel','close_date','created_at'];
  let csv = csvHeaders.join(',') + '\n';
  
  for (const row of result.rows) {
    const values = csvHeaders.map(h => {
      const val = row[h];
      if (val === null || val === undefined) return '';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    });
    csv += values.join(',') + '\n';
  }
  
  fs.writeFileSync('/home/runner/workspace/rats_export.csv', csv);
  console.log(`Exportadas ${result.rows.length} RATs para rats_export.csv`);
  
  // Also export full JSON with form_data
  const jsonData = result.rows.map(r => ({
    ...r,
    form_data: r.form_data ? (typeof r.form_data === 'string' ? JSON.parse(r.form_data) : r.form_data) : null
  }));
  fs.writeFileSync('/home/runner/workspace/rats_export.json', JSON.stringify(jsonData, null, 2));
  console.log(`Exportadas ${result.rows.length} RATs para rats_export.json (com form_data)`);
  
  await pool.end();
}

exportRats().catch(console.error);
