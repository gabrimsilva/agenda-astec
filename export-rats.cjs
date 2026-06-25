const { Client } = require('pg');
const fs = require('fs');

async function exportRats() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  
  const result = await client.query(`SELECT * FROM rats ORDER BY created_at DESC`);
  
  console.log('Total de RATs: ' + result.rows.length);
  if (result.rows.length > 0) {
    console.log('Colunas: ' + Object.keys(result.rows[0]).join(', '));
  }
  
  if (result.rows.length === 0) {
    await client.end();
    return;
  }

  // Get technician names
  const techResult = await client.query('SELECT id, name FROM technicians');
  const techMap = {};
  techResult.rows.forEach(t => { techMap[t.id] = t.name; });
  
  const csvHeaders = ['report_number','report_number_manual','technician_name','client_name','client_name_editable','status','sent_at','send_channel','close_date','created_at'];
  let csv = csvHeaders.join(';') + '\n';
  
  for (const row of result.rows) {
    row.technician_name = techMap[row.technician_id] || '';
    const values = csvHeaders.map(h => {
      const val = row[h];
      if (val === null || val === undefined) return '';
      return '"' + String(val).replace(/"/g, '""') + '"';
    });
    csv += values.join(';') + '\n';
  }
  
  fs.writeFileSync('/home/runner/workspace/rats_export.csv', csv);
  console.log('CSV salvo');
  
  const jsonData = result.rows.map(r => {
    let fd = null;
    try { fd = r.form_data ? (typeof r.form_data === 'string' ? JSON.parse(r.form_data) : r.form_data) : null; } catch(e) { fd = r.form_data; }
    return { ...r, form_data: fd, technician_name: techMap[r.technician_id] || '' };
  });
  fs.writeFileSync('/home/runner/workspace/rats_export.json', JSON.stringify(jsonData, null, 2));
  console.log('JSON salvo');
  
  await client.end();
}

exportRats().catch(e => { console.error(e); process.exit(1); });
